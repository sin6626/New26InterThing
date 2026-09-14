import type {
  SafetyAction,
  SafetyActionSource,
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
import {
  hasBuildFlowTimeout,
  hasPumpIdling,
} from './rules/build-flow.rule.js'
import { hasHeatingNoRise } from './rules/heating-no-rise.rule.js'
import {
  hasConfirmedLowFlow,
  hasImmediateCoolingLowFlow,
} from './rules/low-flow.rule.js'
import { hasOverPressure } from './rules/over-pressure.rule.js'
import { hasOverTemperature } from './rules/over-temperature.rule.js'
import { getSensorTimeoutFault } from './rules/sensor-timeout.rule.js'
import { hasConfirmedReversedTemperature } from './rules/temperature-reversed.rule.js'
import { safetyFaultDetails } from './safety-fault-definitions.js'

export const createSafetySupervisor = (clock: () => number = Date.now) => {
  const sensors = createSensorFreshness(clock)
  let latestReading: SafetyReading | null = null
  let lockedDecision: SafetyDecision | null = null
  let occurredAt: number | null = null
  let latestContext: SafetyContext | null = null
  let lowFlowSince: number | null = null
  let reversedSince: number | null = null
  let heatingBaseline: number | null = null
  let effectiveHeatingMilliseconds = 0
  let lastEffectiveHeatingAt: number | null = null
  let observedManualPumpStartedAt: number | null = null
  let manualFlowEstablished = false
  let flowZeroSince: number | null = null
  let pressureZeroSince: number | null = null

  const isFresh = (key: SensorKey, context: SafetyContext) => (
    sensors.isFresh(key, context.config.dataTimeoutSeconds)
  )

  const refreshActiveZeroObservations = (context: SafetyContext) => {
    const hydraulicallyActive = context.state === 'building-flow'
      || context.state === 'running'
      || context.state === 'cooling'
      || context.desiredPump === 'on'
      || context.desiredHeater === 'on'
      || latestReading?.actualPump === 'on'
      || latestReading?.actualHeater === 'on'
    if (!hydraulicallyActive) {
      flowZeroSince = null
      pressureZeroSince = null
      return
    }
    const now = clock()
    if (sensors.value('flow') === 0) flowZeroSince ??= now
    else flowZeroSince = null
    if (sensors.value('pressure') === 0) pressureZeroSince ??= now
    else pressureZeroSince = null
    const timeoutMilliseconds = context.config.dataTimeoutSeconds * 1_000
    const initiallyBuildingFlow = context.state === 'building-flow'
      || (context.manualPumpStartedAt !== null
        && context.manualPumpStartedAt !== undefined
        && !manualFlowEstablished)
    if (
      !initiallyBuildingFlow
      && flowZeroSince !== null
      && now - flowZeroSince >= timeoutMilliseconds
    ) {
      sensors.invalidate('flow')
    }
    if (
      !initiallyBuildingFlow
      && pressureZeroSince !== null
      && now - pressureZeroSince >= timeoutMilliseconds
    ) {
      sensors.invalidate('pressure')
    }
  }

  const upgradeLockedProtection = (context: SafetyContext) => {
    if (!lockedDecision || lockedDecision.stopPump) return lockedDecision
    const hydraulicPathSafe = latestReading?.actualPump === 'on'
      && isFresh('flow', context)
      && isFresh('pressure', context)
      && (sensors.value('flow') ?? -Infinity) >= context.config.minSafeFlow
      && (sensors.value('pressure') ?? Infinity) < context.config.maxSafePressure
    if (!hydraulicPathSafe) {
      lockedDecision = { ...lockedDecision, stopPump: true }
    }
    return lockedDecision
  }

  const latch = (
    faultCode: SafetyFaultCode,
    options: Partial<Pick<SafetyDecision, 'detail' | 'closeHeater' | 'stopPump'>> = {},
  ) => {
    if (lockedDecision) return lockedDecision
    lockedDecision = {
      faultCode,
      detail: options.detail ?? safetyFaultDetails[faultCode],
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

  const evaluateInitialBuildTimeouts = (context: SafetyContext) => {
    const now = clock()
    if (hasBuildFlowTimeout(now, context)) return latch('BUILD_FLOW_TIMEOUT')
    if (hasPumpIdling(
      now,
      context,
      manualFlowEstablished,
      sensors.value('flow'),
    )) return latch('PUMP_IDLING')
    return null
  }

  const evaluateTimedRules = (context: SafetyContext): SafetyDecision | null => {
    if (lockedDecision) return lockedDecision
    const now = clock()
    const buildDecision = evaluateInitialBuildTimeouts(context)
    if (buildDecision) return buildDecision
    if (!active(context)) return null
    const sensorFault = getSensorTimeoutFault({
      active: true,
      pressureFresh: isFresh('pressure', context),
      flowFresh: isFresh('flow', context),
      inletTemperatureFresh: isFresh('inletTemperature', context),
      outletTemperatureFresh: isFresh('outletTemperature', context),
    })
    if (sensorFault) return latch(sensorFault, {
      stopPump: sensorFault !== 'SENSOR_TEMPERATURE_TIMEOUT',
    })
    if (hasConfirmedLowFlow(now, lowFlowSince, context.config)) {
      return latch(context.state === 'building-flow' ? 'BUILD_FLOW_TIMEOUT' : 'LOW_FLOW')
    }
    if (hasConfirmedReversedTemperature(now, reversedSince, context.config)) {
      return latch('TEMP_SENSOR_REVERSED', { stopPump: false })
    }
    if (hasHeatingNoRise({
      now,
      heatingBaseline,
      outletTemperature: sensors.value('outletTemperature'),
      effectiveHeatingMilliseconds,
      lastEffectiveHeatingAt,
      config: context.config,
    })) {
      return latch('DRY_HEATING_NO_TEMP_RISE', { stopPump: false })
    }
    return null
  }

  const detailWithConcurrentFacts = (
    faultCode: SafetyFaultCode,
    reading: SafetyReading,
    context: SafetyContext,
  ) => {
    const concurrentFacts = [
      !isFresh('pressure', context) ? safetyFaultDetails.SENSOR_PRESSURE_TIMEOUT : null,
      !isFresh('flow', context) ? safetyFaultDetails.SENSOR_FLOW_TIMEOUT : null,
      !isFresh('inletTemperature', context) || !isFresh('outletTemperature', context)
        ? safetyFaultDetails.SENSOR_TEMPERATURE_TIMEOUT
        : null,
      hasOverPressure(reading, context.config)
        ? safetyFaultDetails.OVER_PRESSURE
        : null,
      hasOverTemperature(reading, context.config)
        ? safetyFaultDetails.OVER_TEMPERATURE
        : null,
      reading.flowRate !== null && reading.flowRate < context.config.minSafeFlow
        ? '当前流量低于安全阈值'
        : null,
    ].filter((fact): fact is string => fact !== null)
    const additionalFacts = concurrentFacts.filter(
      fact => fact !== safetyFaultDetails[faultCode],
    )
    return additionalFacts.length === 0
      ? safetyFaultDetails[faultCode]
      : `${safetyFaultDetails[faultCode]}；同时检测到：${additionalFacts.join('、')}`
  }

  const evaluateRequiredSensors = (
    reading: SafetyReading,
    context: SafetyContext,
    includeTemperature = true,
  ) => {
    if (!active(context)) return null
    const withFacts = (faultCode: SafetyFaultCode) => {
      return { detail: detailWithConcurrentFacts(faultCode, reading, context) }
    }
    const faultCode = getSensorTimeoutFault({
      active: true,
      pressureFresh: isFresh('pressure', context),
      flowFresh: isFresh('flow', context),
      inletTemperatureFresh: includeTemperature
        ? isFresh('inletTemperature', context)
        : true,
      outletTemperatureFresh: includeTemperature
        ? isFresh('outletTemperature', context)
        : true,
    })
    if (faultCode) return latch(faultCode, {
      ...withFacts(faultCode),
      stopPump: faultCode !== 'SENSOR_TEMPERATURE_TIMEOUT',
    })
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
      refreshActiveZeroObservations(context)
      if (context.manualPumpStartedAt !== observedManualPumpStartedAt) {
        observedManualPumpStartedAt = context.manualPumpStartedAt ?? null
        manualFlowEstablished = false
      }
      if (
        context.manualPumpStartedAt !== null
        && context.manualPumpStartedAt !== undefined
        && reading.actualPump === 'on'
        && reading.flowRate !== null
        && reading.flowRate >= context.config.minSafeFlow
      ) {
        manualFlowEstablished = true
      }

      if (lockedDecision) {
        return upgradeLockedProtection(context)
      }
      if (hasOverPressure(reading, context.config)) {
        return latch('OVER_PRESSURE', {
          detail: detailWithConcurrentFacts('OVER_PRESSURE', reading, context),
        })
      }
      const buildDecision = evaluateInitialBuildTimeouts(context)
      if (buildDecision) return buildDecision
      const missingHydraulicSensorDecision = evaluateRequiredSensors(
        reading,
        context,
        false,
      )
      if (missingHydraulicSensorDecision) return missingHydraulicSensorDecision
      if (hasImmediateCoolingLowFlow(reading, context.state, context.config)) {
        return latch('LOW_FLOW', {
          detail: detailWithConcurrentFacts('LOW_FLOW', reading, context),
        })
      }
      if (hasOverTemperature(reading, context.config)) {
        const hydraulicsSafe = reading.actualPump === 'on'
          && isFresh('flow', context)
          && isFresh('pressure', context)
          && reading.flowRate !== null
          && reading.flowRate >= context.config.minSafeFlow
          && reading.pressure !== null
          && reading.pressure < context.config.maxSafePressure
        return latch('OVER_TEMPERATURE', {
          detail: detailWithConcurrentFacts('OVER_TEMPERATURE', reading, context),
          stopPump: !hydraulicsSafe,
        })
      }
      if (
        active(context)
        && (!isFresh('inletTemperature', context) || !isFresh('outletTemperature', context))
      ) {
        const hydraulicsSafe = reading.actualPump === 'on'
          && isFresh('flow', context)
          && isFresh('pressure', context)
          && reading.flowRate !== null
          && reading.flowRate >= context.config.minSafeFlow
          && reading.pressure !== null
          && reading.pressure < context.config.maxSafePressure
        return latch('SENSOR_TEMPERATURE_TIMEOUT', {
          detail: detailWithConcurrentFacts(
            'SENSOR_TEMPERATURE_TIMEOUT',
            reading,
            context,
          ),
          stopPump: !hydraulicsSafe,
        })
      }

      const monitorRunningFlow = context.state === 'running'
        || context.state === 'cooling'
        || context.state === 'fault'
      const monitorManualHeatingFlow = context.desiredHeater === 'on'
        || reading.actualHeater === 'on'
      const monitorEstablishedManualPump = manualFlowEstablished
        && context.manualPumpStartedAt !== null
        && context.manualPumpStartedAt !== undefined
      if (
        (monitorRunningFlow || monitorManualHeatingFlow || monitorEstablishedManualPump)
        && reading.flowRate !== null
        && reading.flowRate < context.config.minSafeFlow
      ) {
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
        if (heatingBaseline === null) {
          heatingBaseline = reading.outletTemperature
          effectiveHeatingMilliseconds = 0
        }
        if (lastEffectiveHeatingAt !== null) {
          effectiveHeatingMilliseconds += clock() - lastEffectiveHeatingAt
        }
        lastEffectiveHeatingAt = clock()
      }
      else {
        if (lastEffectiveHeatingAt !== null) {
          effectiveHeatingMilliseconds += clock() - lastEffectiveHeatingAt
        }
        lastEffectiveHeatingAt = null
      }
      if (context.state === 'stopped' && reading.actualHeater === 'off') {
        heatingBaseline = null
        effectiveHeatingMilliseconds = 0
      }
      return evaluateTimedRules(context)
    },

    tick(context: SafetyContext): SafetyDecision | null {
      latestContext = context
      refreshActiveZeroObservations(context)
      if (lockedDecision) return upgradeLockedProtection(context)
      if (latestReading) {
        const missingSensorDecision = evaluateRequiredSensors(latestReading, context)
        if (missingSensorDecision) return missingSensorDecision
      }
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

    authorize(
      action: SafetyAction,
      context: SafetyContext,
      source: SafetyActionSource = 'automation',
    ): SafetyAuthorization {
      if (action.value === 'off') return { allowed: true, reason: null }
      if (lockedDecision) {
        return { allowed: false, reason: `故障已锁定：${lockedDecision.detail}` }
      }
      if (source === 'manual' && context.state !== 'stopped') {
        return { allowed: false, reason: '自动运行、冷却或故障处理期间禁止人工开启设备' }
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
      effectiveHeatingMilliseconds = 0
      lastEffectiveHeatingAt = null
      heatingBaseline = null
      observedManualPumpStartedAt = null
      manualFlowEstablished = false
      flowZeroSince = null
      pressureZeroSince = null
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
