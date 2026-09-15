/**
 * 阅读导航：安全监督器：按优先级执行即时规则、传感器新鲜度、持续确认、故障锁存与动作授权；判断结论由保护流程执行。
 * 入口位置：modules/safety/state/supervisor.ts
 */

import type {
  SafetyAction,
  SafetyActionSource,
  SafetyAuthorization,
  SafetyContext,
  SafetyDecision,
  SafetyFaultCode,
  SafetyReading,
  SafetySnapshot,
} from '../types.js'
import {
  createSensorFreshness,
  type SensorKey,
} from './freshness.js'
import {
  hasBuildFlowTimeout,
  hasPumpIdling,
} from '../rules/build-flow.js'
import { hasHeatingNoRise } from '../rules/heating-no-rise.js'
import {
  hasConfirmedLowFlow,
  hasImmediateCoolingLowFlow,
} from '../rules/low-flow.js'
import { hasOverPressure } from '../rules/over-pressure.js'
import { hasOverTemperature } from '../rules/over-temperature.js'
import { getSensorTimeoutFault } from '../rules/sensor-timeout.js'
import { hasConfirmedReversedTemperature } from '../rules/temperature-reversed.js'
import { safetyFaultDetails } from '../faults/definitions.js'

export const createSafetySupervisor = (clock: () => number = Date.now) => {
  /**
   * 安全监督器只做判断，不直接发布 MQTT。
   * 即时规则随报文判断，持续规则累计时间，tick 在无新报文时检查超时。
   * 故障一旦锁定，只能在满足恢复条件后人工复位。
   */
  const sensors = createSensorFreshness(clock)
  let latestReading: SafetyReading | null = null
  let lockedDecision: SafetyDecision | null = null
  let occurredAt: number | null = null
  let latestContext: SafetyContext | null = null
  // “Since” 保存某条件第一次成立的时间：条件连续成立足够久才触发慢规则；
  // 一旦读数恢复，下面的 handleReading 会清空起点重新计时。
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
    // 运行中的长期 0 值可能是传感器卡死，超时后应视作数据无效。
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
    // 温度故障最初可只关热；水力通道随后变得不安全时再升级为停泵。
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
    // 一个故障周期只锁定首个主故障，避免重复入库和重复弹窗。
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
    // 加热开启需要设备实际水泵、流量、压力与两路温度都有效；
    // 页面希望泵开启(desiredPump)不能代替设备反馈(actualPump)。
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
    // 集中处理必须持续一段时间才成立的规则，过滤瞬时波动。
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
      // 风险优先级：超压/建流 → 关键传感器 → 低流量 → 超温 → 慢规则。
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
        // 已锁故障不因一包正常数据自动恢复；只允许把“先关热”升级为“也停泵”。
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
      // 装反与无温升都只在“设备实际有效加热”时观察。入口温度高于出口温度
      // 并不会立刻报警，而是持续达到 temp_reversed_confirm_time 才锁故障。
      if (
        heatingEffective
        && reading.inletTemperature !== null
        && reading.outletTemperature !== null
        && reading.inletTemperature > reading.outletTemperature
      ) reversedSince ??= clock()
      else reversedSince = null

      if (heatingEffective && reading.outletTemperature !== null) {
        // 无温升规则累计的是有效加热时间；停热或建流阶段不应把墙上时间算进去。
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
      // 关闭动作永远放行，只有开启动作需要经过安全门。
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
      // 复位只解除故障锁，不恢复运行，所以实际和期望执行器必须全部关闭。
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
