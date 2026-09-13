import type {
  ActuatorValue,
  AutomationSnapshot,
  AutomationStatusMessage,
  WaterFlowSnapshot,
} from '@new26interthing/shared'

import { createAutomationActuator } from './automation-actuator.js'
import { createAutomationSafetyBridge } from './automation-safety-bridge.js'
import { createAutomationProtection } from './automation-protection.js'
import { createAutomationTemperatureDemand } from './automation-temperature-demand.js'
import { buildAutomationSnapshot } from './automation-snapshot.js'
import { createSafetySupervisor } from '../safety/safety-supervisor.js'
import type {
  SafetyAction,
  SafetyDecision,
  SafetyFaultCode,
} from '../safety/safety.types.js'
import type {
  AutomationConfig,
  AutomationReading,
} from './automation.types.js'
import { AutomationError } from './automation.types.js'

export type {
  AutomationConfig,
  AutomationReading,
} from './automation.types.js'

interface Dependencies {
  deviceNumber: string
  clock?: () => number
  loadConfig(): Promise<AutomationConfig>
  execute(topic: 'pump' | 'heater', value: ActuatorValue): Promise<void>
  getWaterFlow(): Promise<WaterFlowSnapshot>
  emit(message: AutomationStatusMessage): void
  disableMaster?(reason: string): Promise<void>
  reportFault?(errorNumber: SafetyFaultCode, detail: string): Promise<void>
}

export const createAutomationEngine = ({
  deviceNumber,
  clock = Date.now,
  loadConfig,
  execute,
  getWaterFlow,
  emit,
  disableMaster = async () => {},
  reportFault = async () => {},
}: Dependencies) => {
  const actuator = createAutomationActuator({ execute })
  const safety = createSafetySupervisor(clock)
  let enabled = false
  let state: AutomationSnapshot['state'] = 'stopped'
  let actualPump: AutomationSnapshot['actualPump'] = 'unknown'
  let actualHeater: AutomationSnapshot['actualHeater'] = 'unknown'
  let enteredAt = clock()
  let config: AutomationConfig | null = null
  let outletTemperature: number | null = null
  let limitationReason: string | null = null
  let configFingerprint = ''
  let latestReading: AutomationReading | null = null
  let operationTail = Promise.resolve()
  let manualPumpStartedAt: number | null = null
  let readingGeneration = 0

  const safetyBridge = createAutomationSafetyBridge({
    safety,
    getConfig: () => config,
    getState: () => state,
    getStateEnteredAt: () => enteredAt,
    getDesiredPump: () => actuator.desiredPump,
    getDesiredHeater: () => actuator.desiredHeater,
    getManualPumpStartedAt: () => manualPumpStartedAt,
  })
  const temperatureDemand = createAutomationTemperatureDemand({
    clock,
    getDesiredHeater: () => actuator.desiredHeater,
    authorize: value => safetyBridge.authorize({ topic: 'heater', value }),
    run: value => actuator.run('heater', value),
    setLimitation: reason => {
      limitationReason = reason
    },
    onFailure: error => handleDemandFailure(error),
  })
  const protection = createAutomationProtection({
    clock,
    actuator,
    getState: () => state,
    getActualPump: () => actualPump,
    getActualHeater: () => actualHeater,
    getCoolingDelaySeconds: () => config?.coolingDelaySeconds ?? 0,
    enterFault(detail) {
      enabled = false
      state = 'fault'
      enteredAt = clock()
      limitationReason = detail
    },
    resetTemperatureControl() {
      temperatureDemand.reset()
    },
    refreshSafetyContext: () => {
      if (config) safetyBridge.tick()
    },
    setLimitation: reason => {
      limitationReason = reason
    },
    disableMaster,
    reportFault,
  })

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const current = operationTail.then(operation, operation)
    operationTail = current.then(
      () => undefined,
      () => undefined,
    )
    return current
  }

  const getSnapshot = () => buildAutomationSnapshot({
    deviceNumber,
    enabled,
    state,
    desiredPump: actuator.desiredPump,
    desiredHeater: actuator.desiredHeater,
    actualPump,
    actualHeater,
    enteredAt,
    config,
    outletTemperature,
    pid: temperatureDemand.pid,
    limitationReason,
    lastAction: actuator.lastAction,
    safety: {
      ...safety.getSnapshot(),
      ...protection.reportingSnapshot(),
    },
  }, clock, getWaterFlow)

  const notify = async () => {
    emit({
      type: 'automation.status',
      data: await getSnapshot(),
    })
  }

  const handleDemandFailure = async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    if (actuator.lastAction?.status === 'blocked') return
    await applySafetyDecision(safety.trip(
      'COMMAND_PUBLISH_FAILED',
      `控制指令发布失败：${message}`,
    ))
  }

  const applySafetyDecision = async (decision: SafetyDecision) => {
    await protection.apply(decision)
  }

  const loadCheckedConfig = async () => {
    try {
      const loaded = await loadConfig()
      config = loaded
      configFingerprint = JSON.stringify(loaded)
      return loaded
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await applySafetyDecision(safety.trip(
        'CONTROL_CONFIG_INVALID',
        `控制配置无效：${detail}`,
      ))
      throw new AutomationError(`控制配置无效：${detail}`)
    }
  }

  const updateTemperatureDemand = () => temperatureDemand.update(
    state,
    config,
    outletTemperature,
  )

  return {
    setEnabled(nextEnabled: boolean) {
      return serialize(async () => {
        if (enabled === nextEnabled) return getSnapshot()
        config = await loadCheckedConfig()
        if (nextEnabled) {
          if (safety.getSnapshot().locked) {
            throw new AutomationError(safety.getSnapshot().detail || '故障已锁定，无法启动自动模式')
          }
          const currentReading = latestReading
          const readingAge = currentReading === null
            ? Number.POSITIVE_INFINITY
            : clock() - currentReading.recordedAt
          const readingValuesAvailable = currentReading !== null
            && currentReading.flowRate !== null
            && currentReading.pressure !== null
            && currentReading.inletTemperature !== null
            && currentReading.outletTemperature !== null
            && currentReading.actualPump !== 'unknown'
            && currentReading.actualHeater !== 'unknown'
          if (
            !readingValuesAvailable
            || readingAge < 0
            || readingAge > config.dataTimeoutSeconds * 1_000
          ) {
            throw new AutomationError('最近传感器数据不可用，无法启动自动模式')
          }
          const initialDecision = safetyBridge.evaluateReading(currentReading as AutomationReading)
          if (initialDecision) {
            await applySafetyDecision(initialDecision)
            throw new AutomationError(initialDecision.detail)
          }
          enabled = true
          state = 'building-flow'
          enteredAt = clock()
          limitationReason = '等待设备建流'
          try {
            await actuator.run('pump', 'on')
          }
          catch (error) {
            await handleDemandFailure(error)
            await notify()
            throw new AutomationError(error instanceof Error ? error.message : String(error))
          }
        }
        else {
          enabled = false
          state = actuator.desiredPump === 'on' ? 'cooling' : 'stopped'
          enteredAt = clock()
          limitationReason = state === 'cooling' ? '正在冷却' : null
          try {
            await actuator.run('heater', 'off')
          }
          catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            await handleDemandFailure(error)
            await notify()
            throw new AutomationError(message)
          }
        }
        await notify()
        return getSnapshot()
      })
    },

    handleReading(reading: AutomationReading) {
      readingGeneration += 1
      return serialize(async () => {
        latestReading = reading
        actualPump = reading.actualPump
        actualHeater = reading.actualHeater
        if (reading.outletTemperature !== null) {
          outletTemperature = reading.outletTemperature
        }
        if (!config) {
          try {
            await loadCheckedConfig()
          }
          catch {
            await notify()
            return
          }
        }
        const decision = safetyBridge.evaluateReading(reading)
        if (decision) {
          await applySafetyDecision(decision)
          await notify()
          return
        }
        if (
          state === 'building-flow'
          && config
          && actualPump === 'on'
          && reading.flowRate !== null
          && reading.flowRate >= config.minSafeFlow
        ) {
          state = 'running'
          enteredAt = clock()
          limitationReason = null
        }
        await updateTemperatureDemand()
        await notify()
      })
    },

    tick() {
      return serialize(async () => {
        if (!config) {
          try {
            await loadCheckedConfig()
          }
          catch {
            await notify()
            return
          }
        }
        if (!config) return
        const safetyDecision = safetyBridge.tick()
        if (safetyDecision) {
          await applySafetyDecision(safetyDecision)
        }
        if (state === 'fault') {
          try {
            await protection.stopPumpAfterCooling()
          }
          catch (error) {
            await handleDemandFailure(error)
          }
        }
        let latestConfig: AutomationConfig
        try {
          latestConfig = await loadConfig()
        }
        catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          await applySafetyDecision(safety.trip(
            'CONTROL_CONFIG_INVALID',
            `控制配置无效：${detail}`,
          ))
          await notify()
          return
        }
        const latestFingerprint = JSON.stringify(latestConfig)
        if (latestFingerprint !== configFingerprint) {
          config = latestConfig
          configFingerprint = latestFingerprint
          temperatureDemand.reset()
        }
        const elapsed = (clock() - enteredAt) / 1_000
        if (state === 'cooling' && elapsed >= config.coolingDelaySeconds) {
          try {
            await actuator.run('pump', 'off')
            state = 'stopped'
            limitationReason = null
          }
          catch (error) {
            await handleDemandFailure(error)
          }
        }
        await updateTemperatureDemand()
        await notify()
      })
    },

    getSnapshot,

    authorizeAction(action: SafetyAction) {
      return serialize(async () => {
        if (!config) await loadCheckedConfig()
        if (latestReading) {
          const decision = safetyBridge.evaluateReading(latestReading)
          if (decision) await applySafetyDecision(decision)
        }
        return safetyBridge.authorize(action, 'manual')
      })
    },

    recordCommand(action: SafetyAction) {
      actuator.adoptPublished(action.topic, action.value)
      if (action.topic === 'pump') {
        manualPumpStartedAt = action.value === 'on' ? clock() : null
      }
    },

    handleCommandFailure(action: SafetyAction, message: string) {
      return serialize(async () => {
        const decision = safety.trip(
          'COMMAND_PUBLISH_FAILED',
          `${action.topic}=${action.value} 指令发布失败：${message}`,
        )
        await applySafetyDecision(decision)
        await notify()
      })
    },

    resetFault() {
      return serialize(async () => {
        config = await loadCheckedConfig()
        const resetGeneration = readingGeneration
        const authorization = safetyBridge.canReset()
        if (!authorization.allowed) {
          throw new AutomationError(authorization.reason || '当前不能复位')
        }
        await actuator.run('heater', 'off', true)
        await actuator.run('pump', 'off', true)
        if (readingGeneration !== resetGeneration) {
          throw new AutomationError('复位期间收到新的设备数据，请重新确认安全状态')
        }
        const finalAuthorization = safetyBridge.canReset()
        if (!finalAuthorization.allowed) {
          throw new AutomationError(finalAuthorization.reason || '复位条件已变化')
        }
        safety.reset()
        state = 'stopped'
        enabled = false
        enteredAt = clock()
        limitationReason = null
        protection.reset()
        manualPumpStartedAt = null
        await notify()
        return getSnapshot()
      })
    },

    close() {
      return serialize(async () => {
        enabled = false
        let closeError: unknown
        try {
          await actuator.run('heater', 'off', true)
        }
        catch (error) {
          closeError = error
        }
        try {
          await actuator.run('pump', 'off', true)
        }
        catch (error) {
          closeError ??= error
        }
        state = 'stopped'
        if (closeError) throw closeError
      })
    },
  }
}

export type AutomationEngine = ReturnType<typeof createAutomationEngine>
