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
import {
  accumulateReversedTemperatureEvidence,
  hasConfirmedReversedTemperature,
} from '../rules/temperature-reversed.js'
import { safetyFaultDetails } from '../faults/definitions.js'

/**
 * 创建安全保护模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param clock 可替换的时钟函数，生产使用系统时间，测试可固定时间。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createSafetySupervisor = (
  clock: () => number = Date.now,
  isFaultEnabled: (faultCode: SafetyFaultCode) => boolean = () => true,
) => {
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
  // 低流使用连续起点；装反使用可暂停、可消退的异常证据，分别过滤不同类型的抖动。
  let lowFlowSince: number | null = null
  let reversedEvidenceMilliseconds = 0
  let lastReversedObservationAt: number | null = null
  let heatingBaseline: number | null = null
  let effectiveHeatingMilliseconds = 0
  let lastEffectiveHeatingAt: number | null = null
  let observedManualPumpStartedAt: number | null = null
  let manualFlowEstablished = false

  /**
   * 判断指定传感器事实是否仍在数据超时时间内有效。
   * @param key 需要读取、更新或校验的状态字段名称。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const isFresh = (key: SensorKey, context: SafetyContext) => (
    sensors.isFresh(key, context.config.dataTimeoutSeconds)
  )

  /**
   * 故障锁定后继续观察水力条件，必要时把仅关热升级为同时停泵。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 锁存本轮首个安全故障并生成保护动作；锁存后只能人工复位。
   * @param faultCode 安全模块内部统一使用的故障语义编码。
   * @param options 调用方传入的依赖或业务选项，具体字段见参数的 TypeScript 类型。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const latch = (
    faultCode: SafetyFaultCode,
    options: Partial<Pick<SafetyDecision, 'detail' | 'closeHeater' | 'stopPump'>> = {},
  ) => {
    if (!isFaultEnabled(faultCode)) return null
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

  /**
   * 判断设备是否处于需要执行安全监督的活动状态。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const active = (context: SafetyContext) => (
    context.state !== 'stopped'
    || context.desiredPump === 'on'
    || context.desiredHeater === 'on'
    || latestReading?.actualPump === 'on'
    || latestReading?.actualHeater === 'on'
  )

  /**
   * 汇总当前禁止开启加热的首要原因，供安全授权和页面提示使用。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const currentUnsafeReason = (context: SafetyContext): string | null => {
    // 加热开启需要设备实际水泵、流量、压力与两路温度都有效；
    // 页面希望泵开启(desiredPump)不能代替设备反馈(actualPump)。
    if (lockedDecision) return `故障已锁定：${lockedDecision.detail}`
    if (!latestReading) return '尚未收到传感器数据'
    for (const key of ['flow', 'pressure', 'inletTemperature', 'outletTemperature'] as const) {
      const timeoutCode = key === 'flow'
        ? 'SENSOR_FLOW_TIMEOUT'
        : key === 'pressure'
          ? 'SENSOR_PRESSURE_TIMEOUT'
          : 'SENSOR_TEMPERATURE_TIMEOUT'
      if (!isFresh(key, context) && isFaultEnabled(timeoutCode)) {
        return `${key} 数据无效或已超时`
      }
    }
    if (latestReading.actualPump !== 'on') return '设备实际水泵尚未开启'
    if (
      isFaultEnabled('LOW_FLOW')
      && (sensors.value('flow') ?? 0) < context.config.minSafeFlow
    ) return '当前流量低于安全阈值'
    if (
      isFaultEnabled('OVER_PRESSURE')
      && (sensors.value('pressure') ?? Infinity) >= context.config.maxSafePressure
    ) return '当前压力达到安全上限'
    if (
      isFaultEnabled('OVER_TEMPERATURE')
      && (
      (sensors.value('inletTemperature') ?? Infinity) >= context.config.maxSafeTemperature
      || (sensors.value('outletTemperature') ?? Infinity) >= context.config.maxSafeTemperature
      )
    ) return '当前水温达到安全上限'
    if (
      isFaultEnabled('TEMP_SENSOR_REVERSED')
      && reversedEvidenceMilliseconds > 0
    ) return '正在确认温度探头方向'
    return null
  }

  /**
   * 判断自动或人工建流是否超时，必要时锁存建流类故障。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 按照安全优先级评估需要持续确认的慢速规则。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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
    if (sensorFault && isFaultEnabled(sensorFault)) return latch(sensorFault, {
      stopPump: sensorFault !== 'SENSOR_TEMPERATURE_TIMEOUT',
    })
    if (
      isFaultEnabled('LOW_FLOW')
      && hasConfirmedLowFlow(now, lowFlowSince, context.config)
    ) {
      return latch(context.state === 'building-flow' ? 'BUILD_FLOW_TIMEOUT' : 'LOW_FLOW')
    }
    if (
      isFaultEnabled('TEMP_SENSOR_REVERSED')
      && hasConfirmedReversedTemperature(reversedEvidenceMilliseconds, context.config)
    ) {
      return latch('TEMP_SENSOR_REVERSED', { stopPump: false })
    }
    if (isFaultEnabled('DRY_HEATING_NO_TEMP_RISE') && hasHeatingNoRise({
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

  /**
   * 在主故障说明后补充同一时刻检测到的其他危险事实。
   * @param faultCode 安全模块内部统一使用的故障语义编码。
   * @param reading 已经规范化的本次设备实时读数。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 检查当前动作所需传感器是否有效，缺失时锁存对应故障。
   * @param reading 已经规范化的本次设备实时读数。
   * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
   * @param includeTemperature 是否把进出口温度也作为本次必需传感器检查项。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const evaluateRequiredSensors = (
    reading: SafetyReading,
    context: SafetyContext,
    includeTemperature = true,
  ) => {
    if (!active(context)) return null
    /**
     * 为传感器故障补充同时存在的现场危险事实。
     * @param faultCode 安全模块内部统一使用的故障语义编码。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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
    /**
     * 处理设备的一包实时读数，推进安全保护状态并返回最新结果。
     * @param reading 已经规范化的本次设备实时读数。
     * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    handleReading(reading: SafetyReading, context: SafetyContext): SafetyDecision | null {
      // 风险优先级：超压/建流 → 关键传感器 → 低流量 → 超温 → 慢规则。
      latestReading = reading
      latestContext = context
      sensors.update('flow', reading.flowRate, reading.recordedAt)
      sensors.update('pressure', reading.pressure, reading.recordedAt)
      sensors.update('inletTemperature', reading.inletTemperature, reading.recordedAt)
      sensors.update('outletTemperature', reading.outletTemperature, reading.recordedAt)
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
    if (isFaultEnabled('OVER_PRESSURE') && hasOverPressure(reading, context.config)) {
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
      if (
        isFaultEnabled('LOW_FLOW')
        && hasImmediateCoolingLowFlow(reading, context.state, context.config)
      ) {
        return latch('LOW_FLOW', {
          detail: detailWithConcurrentFacts('LOW_FLOW', reading, context),
        })
      }
      if (isFaultEnabled('OVER_TEMPERATURE') && hasOverTemperature(reading, context.config)) {
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
        isFaultEnabled('SENSOR_TEMPERATURE_TIMEOUT')
        &&
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

      const monitorReversedTemperature = context.state === 'running'
        || monitorEstablishedManualPump
      if (
        monitorReversedTemperature
        && reading.inletTemperature !== null
        && Number.isFinite(reading.inletTemperature)
        && reading.outletTemperature !== null
        && Number.isFinite(reading.outletTemperature)
      ) {
        const observedAt = clock()
        const elapsedMilliseconds = lastReversedObservationAt === null
          ? 0
          : observedAt - lastReversedObservationAt
        // 报文间隔超过数据超时说明观察不连续，不能把离线空档算作异常证据。
        if (elapsedMilliseconds > context.config.dataTimeoutSeconds * 1_000) {
          reversedEvidenceMilliseconds = 0
        }
        reversedEvidenceMilliseconds = accumulateReversedTemperatureEvidence(
          reversedEvidenceMilliseconds,
          Math.max(0, elapsedMilliseconds),
          reading.inletTemperature,
          reading.outletTemperature,
        )
        lastReversedObservationAt = observedAt
      }
      else {
        // 建流、停止、冷却和故障阶段都重新开始观察，避免跨状态继承旧证据。
        reversedEvidenceMilliseconds = 0
        lastReversedObservationAt = null
      }

      const heatingEffective = reading.actualPump === 'on'
        && reading.actualHeater === 'on'
        && reading.flowRate !== null
        && reading.flowRate >= context.config.minSafeFlow

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
        // 实际加热器关闭或水力条件失效就结束本轮观察，不能跨加热周期拼接证据。
        heatingBaseline = null
        effectiveHeatingMilliseconds = 0
        lastEffectiveHeatingAt = null
      }
      return evaluateTimedRules(context)
    },

    /**
     * 由定时器周期调用，在没有新报文时继续推进安全保护超时和时间规则。
     * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    tick(context: SafetyContext): SafetyDecision | null {
      latestContext = context
      if (lockedDecision) return upgradeLockedProtection(context)
      if (latestReading) {
        const missingSensorDecision = evaluateRequiredSensors(latestReading, context)
        if (missingSensorDecision) return missingSensorDecision
      }
      return evaluateTimedRules(context)
    },

    /**
     * 由外部诊断主动触发并锁存故障，复用统一的安全保护流程。
     * @param faultCode 安全模块内部统一使用的故障语义编码。
     * @param detail 故障或动作的补充说明，帮助现场定位具体原因。
     * @param options 调用方传入的依赖或业务选项，具体字段见参数的 TypeScript 类型。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    trip(
      faultCode: SafetyFaultCode,
      detail?: string,
      options?: Partial<Pick<SafetyDecision, 'closeHeater' | 'stopPump'>>,
    ): SafetyDecision | null {
      const decision = latch(faultCode, options)
      if (detail && decision?.faultCode === faultCode) decision.detail = detail
      return decision
    },

    /**
     * 根据当前安全事实判断控制动作是否允许，并返回明确的拒绝原因。
     * @param action 待安全授权或执行的设备控制动作。
     * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
     * @param source 动作来源，用于区分人工操作与自动控制。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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

    /**
     * 判断安全保护当前是否满足对应业务条件；本函数不主动执行外部操作。
     * @param context 当前自动状态、期望执行器状态和安全参数组成的上下文。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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

    /**
     * 重置安全保护当前状态；只清理本函数负责的数据，不会隐式启动设备。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    reset() {
      lockedDecision = null
      occurredAt = null
      lowFlowSince = null
      reversedEvidenceMilliseconds = 0
      lastReversedObservationAt = null
      effectiveHeatingMilliseconds = 0
      lastEffectiveHeatingAt = null
      heatingBaseline = null
      observedManualPumpStartedAt = null
      manualFlowEstablished = false
    },

    /**
     * 返回指定设备当前快照，供 HTTP 查询或 WebSocket 展示。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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
