import type {
  ActuatorValue,
  AutomationSnapshot,
  AutomationStatusMessage,
  WaterFlowSnapshot,
} from '@new26interthing/shared'

import {
  createTemperatureController,
  hysteresisDemand,
  type PidConfig,
} from './temperature-controller.js'

export interface AutomationConfig {
  strategy: 'hysteresis' | 'pid'
  targetTemperature: number
  temperatureHysteresis: number
  minSafeFlow: number
  buildFlowTimeoutSeconds: number
  coolingDelaySeconds: number
  dataTimeoutSeconds: number
  pid: PidConfig
}

export interface AutomationReading {
  recordedAt: number
  flowRate: number | null
  outletTemperature: number | null
  actualPump: ActuatorValue | 'unknown'
  actualHeater: ActuatorValue | 'unknown'
}

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
  let enabled = false
  let state: AutomationSnapshot['state'] = 'stopped'
  let desiredPump: ActuatorValue = 'off'
  let desiredHeater: ActuatorValue = 'off'
  let actualPump: AutomationSnapshot['actualPump'] = 'unknown'
  let actualHeater: AutomationSnapshot['actualHeater'] = 'unknown'
  let enteredAt = clock()
  let config: AutomationConfig | null = null
  let outletTemperature: number | null = null
  let pid: AutomationSnapshot['pid'] = null
  let limitationReason: string | null = null
  let lastAction: AutomationSnapshot['lastAction'] = null
  let publishedPump: ActuatorValue = 'off'
  let publishedHeater: ActuatorValue = 'off'
  let configFingerprint = ''
  let latestReading: AutomationReading | null = null
  let actionTail = Promise.resolve()
  let operationTail = Promise.resolve()

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const current = operationTail.then(operation, operation)
    operationTail = current.then(
      () => undefined,
      () => undefined,
    )
    return current
  }

  const runAction = async (
    topic: 'pump' | 'heater',
    value: ActuatorValue,
  ) => {
    if (topic === 'pump') {
      desiredPump = value
      if (publishedPump === value) return
    }
    if (topic === 'heater') {
      desiredHeater = value
      if (publishedHeater === value) return
    }
    actionTail = actionTail.then(() => execute(topic, value))
    try {
      await actionTail
      if (topic === 'pump') publishedPump = value
      if (topic === 'heater') publishedHeater = value
      lastAction = {
        topic,
        value,
        status: 'published',
        message: 'MQTT 已发布',
      }
    }
    catch (error) {
      actionTail = Promise.resolve()
      const message = error instanceof Error ? error.message : String(error)
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined
      lastAction = {
        topic,
        value,
        status: errorCode === 'HEATER_SAFETY_BLOCKED' ? 'blocked' : 'failed',
        message,
      }
      throw error
    }
  }

  const getSnapshot = async (): Promise<AutomationSnapshot> => ({
    deviceNumber,
    enabled,
    state,
    desiredPump,
    desiredHeater,
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
    lastAction,
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
    if (lastAction?.status === 'blocked') return

    enabled = false
    state = desiredPump === 'on' ? 'cooling' : 'stopped'
    enteredAt = clock()
    try {
      await runAction('heater', 'off')
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
        desiredHeater,
      )
      limitationReason = pid.limitationReason
      try {
        await runAction('heater', pid.desired)
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
      desiredHeater,
    )
    try {
      await runAction('heater', demand)
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
          await runAction('pump', 'on')
          enabled = true
          state = 'building-flow'
          enteredAt = clock()
          limitationReason = '等待设备建流'
        }
        else {
          enabled = false
          await runAction('heater', 'off')
          state = desiredPump === 'on' ? 'cooling' : 'stopped'
          enteredAt = clock()
          limitationReason = state === 'cooling' ? '正在冷却' : null
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
          await runAction('heater', 'off')
          await runAction('pump', 'off')
          state = 'stopped'
          limitationReason = '启动超时，未建立安全流量'
          await disableMaster(limitationReason)
        }
        if (state === 'cooling' && elapsed >= config.coolingDelaySeconds) {
          await runAction('pump', 'off')
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
        await runAction('heater', 'off')
        await runAction('pump', 'off')
        state = 'stopped'
      })
    },
  }
}

export type AutomationEngine = ReturnType<typeof createAutomationEngine>
