/**
 * 阅读导航：安全衔接层：将自动状态、期望执行器状态和设备读数整理为 safety 模块统一事实；避免安全规则读取页面状态。
 * 入口位置：modules/automation/flows/safety-bridge.ts
 */

import type {
  ActuatorValue,
  AutomationState,
} from '@new26interthing/shared'

import type {
  SafetyAction,
  SafetyActionSource,
} from '../../safety/types.js'
import type { SafetySupervisor } from '../../safety/state/supervisor.js'
import type {
  AutomationConfig,
  AutomationReading,
} from '../types.js'

interface Dependencies {
  safety: SafetySupervisor
  getConfig(): AutomationConfig | null
  getState(): AutomationState
  getStateEnteredAt(): number
  getDesiredPump(): ActuatorValue
  getDesiredHeater(): ActuatorValue
  getManualPumpStartedAt(): number | null
}

/** 将自动状态机上下文整理成 SafetySupervisor 所需的统一判断输入。 */
export const createAutomationSafetyBridge = ({
  safety,
  getConfig,
  getState,
  getStateEnteredAt,
  getDesiredPump,
  getDesiredHeater,
  getManualPumpStartedAt,
}: Dependencies) => {
  /**
   * 根据引擎当前状态构造安全监督器需要的完整判断上下文。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const context = () => {
    const config = getConfig()
    if (!config) throw new Error('控制配置尚未加载')
    return {
      state: getState(),
      stateEnteredAt: getStateEnteredAt(),
      manualPumpStartedAt: getManualPumpStartedAt(),
      desiredPump: getDesiredPump(),
      desiredHeater: getDesiredHeater(),
      config: {
        minSafeFlow: config.minSafeFlow,
        maxSafePressure: config.maxSafePressure,
        maxSafeTemperature: config.maxSafeTemperature,
        dataTimeoutSeconds: config.dataTimeoutSeconds,
        lowFlowConfirmSeconds: config.lowFlowConfirmSeconds,
        buildFlowTimeoutSeconds: config.buildFlowTimeoutSeconds,
        temperatureReversedConfirmSeconds: config.temperatureReversedConfirmSeconds,
        dryHeatingTimeoutSeconds: config.dryHeatingTimeoutSeconds,
        dryHeatingTemperatureDifference: config.dryHeatingTemperatureDifference,
      },
    }
  }

  return {
    context,
    /**
     * 把一包实时读数交给安全监督器，并返回可能产生的保护决定。
     * @param reading 已经规范化的本次设备实时读数。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    evaluateReading(reading: AutomationReading) {
      return safety.handleReading({
        recordedAt: reading.recordedAt,
        flowRate: reading.flowRate,
        pressure: reading.pressure ?? null,
        inletTemperature: reading.inletTemperature ?? null,
        outletTemperature: reading.outletTemperature,
        actualPump: reading.actualPump,
        actualHeater: reading.actualHeater,
      }, context())
    },
    /**
     * 由定时器周期调用，在没有新报文时继续推进自动控制超时和时间规则。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    tick() {
      return safety.tick(context())
    },
    /**
     * 根据当前安全事实判断控制动作是否允许，并返回明确的拒绝原因。
     * @param action 待安全授权或执行的设备控制动作。
     * @param source 动作来源，用于区分人工操作与自动控制。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    authorize(action: SafetyAction, source: SafetyActionSource = 'automation') {
      return safety.authorize(action, context(), source)
    },
    /**
     * 判断自动控制当前是否满足对应业务条件；本函数不主动执行外部操作。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    canReset() {
      return safety.canReset(context())
    },
  }
}
