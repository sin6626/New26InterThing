import type {
  ActuatorValue,
  AutomationSnapshot,
  AutomationStatusMessage,
  WaterFlowSnapshot,
} from '@new26interthing/shared'

import {
  createTemperatureController,
  hysteresisDemand,
} from './temperature-controller.js'
import { createAutomationActuator } from './automation-actuator.js'
import type {
  AutomationConfig,
  AutomationReading,
} from './automation.types.js'

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
}

export const createAutomationEngine = ({
  deviceNumber,
  clock = Date.now,
  loadConfig,
  execute,
  getWaterFlow,
  emit,
  disableMaster = async () => {},
}: Dependencies) => {
  const temperatureController = createTemperatureController(clock)
  const actuator = createAutomationActuator({ execute })
  let enabled = false
  let state: AutomationSnapshot['state'] = 'stopped'
  let actualPump: AutomationSnapshot['actualPump'] = 'unknown'
  let actualHeater: AutomationSnapshot['actualHeater'] = 'unknown'
  let enteredAt = clock()
  let config: AutomationConfig | null = null
  let outletTemperature: number | null = null
  let pid: AutomationSnapshot['pid'] = null
  let limitationReason: string | null = null
  let configFingerprint = ''
  let latestReading: AutomationReading | null = null
  let operationTail = Promise.resolve()

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const current = operationTail.then(operation, operation)
    operationTail = current.then(
      () => undefined,
      () => undefined,
    )
    return current
  }

  const getSnapshot = async (): Promise<AutomationSnapshot> => ({
    deviceNumber,
    enabled,
    state,
    desiredPump: actuator.desiredPump,
    desiredHeater: actuator.desiredHeater,
    actualPump,
    actualHeater,
    countdownSeconds: state === 'building-flow' && config
      ? Math.max(0, Math.ceil(
          config.buildFlowTimeoutSeconds - (clock() - enteredAt) / 1_000,
        ))
      : state === 'cooling' && config
        ? Math.max(0, Math.ceil(
            config.coolingDelaySeconds - (clock() - enteredAt) / 1_000,
          ))
        : null,
    temperatureStrategy: config?.strategy ?? null,
    targetTemperature: config?.targetTemperature ?? null,
    outletTemperature,
    pid,
    limitationReason,
    lastAction: actuator.lastAction,
    waterFlow: await getWaterFlow(),
  })

  const notify = async () => {
    emit({
      type: 'automation.status',
      data: await getSnapshot(),
    })
  }

  const handleDemandFailure = async (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    limitationReason = message
    if (actuator.lastAction?.status === 'blocked') return

    enabled = false
    state = actuator.desiredPump === 'on' ? 'cooling' : 'stopped'
    enteredAt = clock()
    try {
      await actuator.run('heater', 'off')
    }
    catch {
      limitationReason = message
    }
    await disableMaster(message)
  }

  const updateTemperatureDemand = async () => {
    if (state !== 'running' || !config || outletTemperature === null) return
    if (config.strategy === 'pid') {
      pid = temperatureController.update(
        outletTemperature,
        config.pid,
        actuator.desiredHeater,
      )
      limitationReason = pid.limitationReason
      try {
        await actuator.run('heater', pid.desired)
      }
      catch (error) {
        await handleDemandFailure(error)
      }
      return
    }

    const demand = hysteresisDemand(
      outletTemperature,
      config.targetTemperature,
      config.temperatureHysteresis,
      actuator.desiredHeater,
    )
    try {
      await actuator.run('heater', demand)
    }
    catch (error) {
      await handleDemandFailure(error)
    }
  }

  return {
    setEnabled(nextEnabled: boolean) {
      return serialize(async () => {
        if (enabled === nextEnabled) return getSnapshot()
        config = await loadConfig()
        if (nextEnabled) {
          const readingAge = latestReading === null
            ? Number.POSITIVE_INFINITY
            : clock() - latestReading.recordedAt
          const readingValuesAvailable = latestReading !== null
            && latestReading.flowRate !== null
            && latestReading.outletTemperature !== null
            && latestReading.actualPump !== 'unknown'
            && latestReading.actualHeater !== 'unknown'
          if (
            !readingValuesAvailable
            || readingAge < 0
            || readingAge > config.dataTimeoutSeconds * 1_000
          ) {
            throw new Error('最近传感器数据不可用，无法启动自动模式')
          }
          configFingerprint = JSON.stringify(config)
          await actuator.run('pump', 'on')
          enabled = true
          state = 'building-flow'
          enteredAt = clock()
          limitationReason = '等待设备建流'
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
            limitationReason = message
            await disableMaster(message)
            await notify()
            throw error
          }
        }
        await notify()
        return getSnapshot()
      })
    },

    handleReading(reading: AutomationReading) {
      return serialize(async () => {
        latestReading = reading
        actualPump = reading.actualPump
        actualHeater = reading.actualHeater
        outletTemperature = reading.outletTemperature
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
        if (!config) return
        const latestConfig = await loadConfig()
        const latestFingerprint = JSON.stringify(latestConfig)
        if (latestFingerprint !== configFingerprint) {
          config = latestConfig
          configFingerprint = latestFingerprint
          temperatureController.reset()
          pid = null
        }
        const elapsed = (clock() - enteredAt) / 1_000
        if (state === 'building-flow' && elapsed >= config.buildFlowTimeoutSeconds) {
          enabled = false
          await actuator.run('heater', 'off')
          await actuator.run('pump', 'off')
          state = 'stopped'
          limitationReason = '启动超时，未建立安全流量'
          await disableMaster(limitationReason)
        }
        if (state === 'cooling' && elapsed >= config.coolingDelaySeconds) {
          await actuator.run('pump', 'off')
          state = 'stopped'
          limitationReason = null
        }
        await updateTemperatureDemand()
        await notify()
      })
    },

    getSnapshot,

    close() {
      return serialize(async () => {
        enabled = false
        await actuator.run('heater', 'off')
        await actuator.run('pump', 'off')
        state = 'stopped'
      })
    },
  }
}

export type AutomationEngine = ReturnType<typeof createAutomationEngine>
