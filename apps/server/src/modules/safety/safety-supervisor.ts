import type {
  SafetyAction,
  SafetyAuthorization,
  SafetyContext,
  SafetyDecision,
  SafetyFaultCode,
  SafetyReading,
  SafetySnapshot,
} from './safety.types.js'
import {
  createSensorFreshness,
  type SensorKey,
} from './sensor-freshness.js'

const decisionDetails: Record<SafetyFaultCode, string> = {
  CONTROL_CONFIG_INVALID: '控制配置无效',
  BUILD_FLOW_TIMEOUT: '水泵启动后未在限定时间内建立安全流量',
  COMMAND_PUBLISH_FAILED: '控制指令发布失败',
  LOW_FLOW: '运行流量持续低于安全阈值',
  PUMP_IDLING: '人工开启水泵后未建立安全流量',
  OVER_PRESSURE: '管路压力达到或超过安全上限',
  OVER_TEMPERATURE: '水温达到或超过安全上限',
  SENSOR_FLOW_TIMEOUT: '流量传感器数据超时或无效',
  SENSOR_PRESSURE_TIMEOUT: '压力传感器数据超时或无效',
  SENSOR_TEMPERATURE_TIMEOUT: '温度传感器数据超时或无效',
  TEMP_SENSOR_REVERSED: '入口温度持续高于出口温度，温度探头疑似装反',
  DRY_HEATING_NO_TEMP_RISE: '有效加热时间内出口温度没有达到最低温升',
}

export const createSafetySupervisor = (clock: () => number = Date.now) => {
  const sensors = createSensorFreshness(clock)
  let latestReading: SafetyReading | null = null
  let lockedDecision: SafetyDecision | null = null
  let occurredAt: number | null = null
  let latestContext: SafetyContext | null = null
  let lowFlowSince: number | null = null
  let reversedSince: number | null = null
  let heatingBaseline: number | null = null
  let effectiveHeatingStartedAt: number | null = null

  const isFresh = (key: SensorKey, context: SafetyContext) => (
    sensors.isFresh(key, context.config.dataTimeoutSeconds)
  )

  const latch = (
    faultCode: SafetyFaultCode,
    options: Partial<Pick<SafetyDecision, 'closeHeater' | 'stopPump'>> = {},
  ) => {
    if (lockedDecision) return lockedDecision
    lockedDecision = {
      faultCode,
      detail: decisionDetails[faultCode],
      closeHeater: options.closeHeater ?? true,
      stopPump: options.stopPump ?? true,
    }
    occurredAt = clock()
    return lockedDecision
  }

  const active = (context: SafetyContext) => (
    context.state !== 'stopped'
    || context.desiredPump === 'on'
    || context.desiredHeater === 'on'
    || latestReading?.actualPump === 'on'
    || latestReading?.actualHeater === 'on'
  )

  const currentUnsafeReason = (context: SafetyContext): string | null => {
    if (lockedDecision) return `故障已锁定：${lockedDecision.detail}`
    if (!latestReading) return '尚未收到传感器数据'
    for (const key of ['flow', 'pressure', 'inletTemperature', 'outletTemperature'] as const) {
      if (!isFresh(key, context)) return `${key} 数据无效或已超时`
    }
    if (latestReading.actualPump !== 'on') return '设备实际水泵尚未开启'
    if ((sensors.value('flow') ?? 0) < context.config.minSafeFlow) return '当前流量低于安全阈值'
    if ((sensors.value('pressure') ?? Infinity) >= context.config.maxSafePressure) return '当前压力达到安全上限'
    if (
      (sensors.value('inletTemperature') ?? Infinity) >= context.config.maxSafeTemperature
      || (sensors.value('outletTemperature') ?? Infinity) >= context.config.maxSafeTemperature
    ) return '当前水温达到安全上限'
    if (reversedSince !== null) return '正在确认温度探头方向'
    return null
  }

  const evaluateTimedRules = (context: SafetyContext): SafetyDecision | null => {
    if (lockedDecision) return lockedDecision
    const now = clock()
    if (context.state === 'building-flow' && context.stateEnteredAt !== undefined) {
      if (now - context.stateEnteredAt >= context.config.buildFlowTimeoutSeconds * 1_000) {
        return latch('BUILD_FLOW_TIMEOUT')
      }
    }
    if (
      context.manualPumpStartedAt !== undefined
      && context.manualPumpStartedAt !== null
      && (sensors.value('flow') ?? 0) < context.config.minSafeFlow
      && now - context.manualPumpStartedAt >= context.config.buildFlowTimeoutSeconds * 1_000
    ) return latch('PUMP_IDLING')
    if (!active(context)) return null
    if (!isFresh('pressure', context)) return latch('SENSOR_PRESSURE_TIMEOUT')
    if (!isFresh('flow', context)) return latch('SENSOR_FLOW_TIMEOUT')
    if (!isFresh('inletTemperature', context) || !isFresh('outletTemperature', context)) {
      return latch('SENSOR_TEMPERATURE_TIMEOUT', { stopPump: false })
    }
    if (lowFlowSince !== null && now - lowFlowSince >= context.config.lowFlowConfirmSeconds * 1_000) {
      return latch(context.state === 'building-flow' ? 'BUILD_FLOW_TIMEOUT' : 'LOW_FLOW')
    }
    if (reversedSince !== null && now - reversedSince >= context.config.temperatureReversedConfirmSeconds * 1_000) {
      return latch('TEMP_SENSOR_REVERSED', { stopPump: false })
    }
    if (
      effectiveHeatingStartedAt !== null
      && heatingBaseline !== null
      && now - effectiveHeatingStartedAt >= context.config.dryHeatingTimeoutSeconds * 1_000
      && (sensors.value('outletTemperature') ?? heatingBaseline) - heatingBaseline
        < context.config.dryHeatingTemperatureDifference
    ) {
      return latch('DRY_HEATING_NO_TEMP_RISE', { stopPump: false })
    }
    return null
  }

  const api = {
    handleReading(reading: SafetyReading, context: SafetyContext): SafetyDecision | null {
      latestReading = reading
      latestContext = context
      sensors.update('flow', reading.flowRate, reading.recordedAt)
      sensors.update('pressure', reading.pressure, reading.recordedAt)
      sensors.update('inletTemperature', reading.inletTemperature, reading.recordedAt, true)
      sensors.update('outletTemperature', reading.outletTemperature, reading.recordedAt, true)

      if (lockedDecision) return lockedDecision
      if (reading.pressure !== null && reading.pressure >= context.config.maxSafePressure) {
        return latch('OVER_PRESSURE')
      }
      if (
        (reading.inletTemperature !== null && reading.inletTemperature >= context.config.maxSafeTemperature)
        || (reading.outletTemperature !== null && reading.outletTemperature >= context.config.maxSafeTemperature)
      ) {
        return latch('OVER_TEMPERATURE', { stopPump: false })
      }

      const monitorRunningFlow = context.state === 'running'
        || context.state === 'cooling'
        || context.state === 'fault'
      if (
        (context.state === 'cooling' || context.state === 'fault')
        && reading.flowRate !== null
        && reading.flowRate < context.config.minSafeFlow
      ) return latch('LOW_FLOW')
      if (monitorRunningFlow && reading.flowRate !== null && reading.flowRate < context.config.minSafeFlow) {
        lowFlowSince ??= clock()
      }
      else {
        lowFlowSince = null
      }

      const heatingEffective = reading.actualPump === 'on'
        && reading.actualHeater === 'on'
        && reading.flowRate !== null
        && reading.flowRate >= context.config.minSafeFlow
      if (
        heatingEffective
        && reading.inletTemperature !== null
        && reading.outletTemperature !== null
        && reading.inletTemperature > reading.outletTemperature
      ) reversedSince ??= clock()
      else reversedSince = null

      if (heatingEffective && reading.outletTemperature !== null) {
        if (effectiveHeatingStartedAt === null) {
          effectiveHeatingStartedAt = clock()
          heatingBaseline = reading.outletTemperature
        }
      }
      else {
        effectiveHeatingStartedAt = null
        heatingBaseline = null
      }
      return evaluateTimedRules(context)
    },

    tick(context: SafetyContext): SafetyDecision | null {
      latestContext = context
      return evaluateTimedRules(context)
    },

    trip(
      faultCode: SafetyFaultCode,
      detail?: string,
      options?: Partial<Pick<SafetyDecision, 'closeHeater' | 'stopPump'>>,
    ): SafetyDecision {
      const decision = latch(faultCode, options)
      if (detail && decision.faultCode === faultCode) decision.detail = detail
      return decision
    },

    authorize(action: SafetyAction, context: SafetyContext): SafetyAuthorization {
      if (action.value === 'off') return { allowed: true, reason: null }
      if (lockedDecision) {
        return { allowed: false, reason: `故障已锁定：${lockedDecision.detail}` }
      }
      if (action.topic === 'pump') {
        return { allowed: true, reason: null }
      }
      const reason = currentUnsafeReason(context)
      return { allowed: reason === null, reason }
    },

    canReset(context: SafetyContext): SafetyAuthorization {
      if (!lockedDecision) return { allowed: false, reason: '当前没有锁定故障' }
      if (context.state !== 'fault') return { allowed: false, reason: '自动状态尚未进入故障' }
      if (
        context.desiredPump !== 'off'
        || context.desiredHeater !== 'off'
        || latestReading?.actualPump !== 'off'
        || latestReading.actualHeater !== 'off'
      ) return { allowed: false, reason: '水泵和加热尚未全部关闭' }
      for (const key of ['flow', 'pressure', 'inletTemperature', 'outletTemperature'] as const) {
        if (!isFresh(key, context)) return { allowed: false, reason: `${key} 数据无效或已超时` }
      }
      if ((sensors.value('pressure') ?? Infinity) >= context.config.maxSafePressure) {
        return { allowed: false, reason: '当前压力仍达到安全上限' }
      }
      if (
        (sensors.value('inletTemperature') ?? Infinity) >= context.config.maxSafeTemperature
        || (sensors.value('outletTemperature') ?? Infinity) >= context.config.maxSafeTemperature
      ) return { allowed: false, reason: '当前水温仍达到安全上限' }
      return { allowed: true, reason: null }
    },

    reset() {
      lockedDecision = null
      occurredAt = null
      lowFlowSince = null
      reversedSince = null
      effectiveHeatingStartedAt = null
      heatingBaseline = null
    },

    getSnapshot(): SafetySnapshot {
      const reset = latestContext ? api.canReset(latestContext) : {
        allowed: false,
        reason: '尚未收到控制上下文',
      }
      return {
        locked: lockedDecision !== null,
        faultCode: lockedDecision?.faultCode ?? null,
        detail: lockedDecision?.detail ?? null,
        occurredAt: occurredAt === null ? null : new Date(occurredAt).toISOString(),
        resetAllowed: reset.allowed,
        resetReason: reset.reason,
        faultRecorded: false,
        faultRecordError: null,
        protection: lockedDecision
          ? {
              closeHeater: lockedDecision.closeHeater,
              stopPump: lockedDecision.stopPump,
            }
          : null,
        sensors: {
          flow: sensors.status('flow', latestContext?.config.dataTimeoutSeconds),
          pressure: sensors.status('pressure', latestContext?.config.dataTimeoutSeconds),
          inletTemperature: sensors.status('inletTemperature', latestContext?.config.dataTimeoutSeconds),
          outletTemperature: sensors.status('outletTemperature', latestContext?.config.dataTimeoutSeconds),
        },
      }
    },
  }
  return api
}

export type SafetySupervisor = ReturnType<typeof createSafetySupervisor>
