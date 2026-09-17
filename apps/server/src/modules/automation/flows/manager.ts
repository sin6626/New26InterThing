/**
 * 阅读导航：自动控制管理器：延迟创建单设备状态机，并向 HTTP、MQTT 和定时器提供共同入口；避免多个调用方各自维护状态。
 * 入口位置：modules/automation/flows/manager.ts
 */

import type { AutomationStatusMessage } from '@new26interthing/shared'
import type {
  SafetyAction,
  SafetyFaultCode,
} from '../../safety/types.js'

import {
  createAutomationEngine,
  type AutomationEngine,
} from './engine.js'
import type {
  AutomationConfig,
  AutomationConfigLoadOptions,
  AutomationReading,
} from '../types.js'
import type { WaterFlowService } from '../../water-flow/accumulate.js'

interface Dependencies {
  clock?: () => number
  loadConfig(options?: AutomationConfigLoadOptions): Promise<AutomationConfig>
  execute(
    deviceNumber: string,
    topic: 'pump' | 'heater',
    value: 'on' | 'off',
  ): Promise<void>
  waterFlow: WaterFlowService
  emit(message: AutomationStatusMessage): void
  disableMaster(deviceNumber: string, reason: string): Promise<void>
  reportFault(
    deviceNumber: string,
    errorNumber: SafetyFaultCode,
    detail: string,
  ): Promise<void>
}

/** 按设备编号延迟创建并缓存状态机，对 HTTP、MQTT 和定时器提供统一入口。 */
export const createAutomationManager = ({
  clock,
  loadConfig,
  execute,
  waterFlow,
  emit,
  disableMaster,
  reportFault,
}: Dependencies) => {
  let engine: AutomationEngine | undefined
  let debugMode = false
  let activeDeviceNumber: string | undefined

  /**
   * 读取自动控制需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const getEngine = (deviceNumber: string) => {
    if (engine && activeDeviceNumber !== deviceNumber) {
      throw new Error('系统只允许维护一台自动控制设备')
    }
    if (engine) return engine
    activeDeviceNumber = deviceNumber
    engine = createAutomationEngine({
      deviceNumber,
      initialDebugMode: debugMode,
      clock,
      loadConfig,
      execute: (topic, value) => execute(deviceNumber, topic, value),
      getWaterFlow: () => waterFlow.getSnapshot(deviceNumber),
      emit,
      disableMaster: reason => disableMaster(deviceNumber, reason),
      reportFault: (errorNumber, detail) => reportFault(
        deviceNumber,
        errorNumber,
        detail,
      ),
    })
    return engine
  }

  return {
    /**
     * 更新自动控制状态，并返回或广播更新后的结果。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param enabled 自动模式是否开启。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async setEnabled(deviceNumber: string, enabled: boolean) {
      const currentEngine = getEngine(deviceNumber)
      if (debugMode) await currentEngine.setDebugMode(true)
      return currentEngine.setEnabled(enabled)
    },
    /**
     * 读取自动控制需要的数据或状态，并转换成调用方可以直接使用的结果。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    getDebugMode() {
      return { enabled: debugMode }
    },
    /**
     * 更新自动控制状态，并返回或广播更新后的结果。
     * @param enabled 自动模式是否开启。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async setDebugMode(enabled: boolean) {
      debugMode = enabled
      await engine?.setDebugMode(enabled)
      return { enabled: debugMode }
    },
    /**
     * 返回指定设备当前快照，供 HTTP 查询或 WebSocket 展示。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    getSnapshot(deviceNumber: string) {
      return getEngine(deviceNumber).getSnapshot()
    },
    /**
     * 处理设备的一包实时读数，推进自动控制状态并返回最新结果。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param reading 已经规范化的本次设备实时读数。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    handleReading(deviceNumber: string, reading: AutomationReading) {
      return getEngine(deviceNumber).handleReading(reading)
    },
    /**
     * 根据当前安全事实判断控制动作是否允许，并返回明确的拒绝原因。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param action 待安全授权或执行的设备控制动作。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    authorizeAction(deviceNumber: string, action: SafetyAction) {
      return getEngine(deviceNumber).authorizeAction(action)
    },
    /**
     * 执行一次自动控制业务操作，按照模块规则更新状态和外部副作用。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param action 待安全授权或执行的设备控制动作。
     * @param publish 真正执行 MQTT 发布的底层函数。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    executeAction(
      deviceNumber: string,
      action: SafetyAction,
      publish: () => Promise<void>,
    ) {
      return getEngine(deviceNumber).executeManualAction(action, publish)
    },
    /**
     * 保存自动控制数据，并完成该写入需要的一致性处理。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param action 待安全授权或执行的设备控制动作。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    recordCommand(deviceNumber: string, action: SafetyAction) {
      getEngine(deviceNumber).recordCommand(action)
    },
    /**
     * 保存自动控制数据，并完成该写入需要的一致性处理。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param action 待安全授权或执行的设备控制动作。
     * @param message 已经解析或准备发送的消息对象。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    recordCommandFailure(
      deviceNumber: string,
      action: SafetyAction,
      message: string,
    ) {
      return getEngine(deviceNumber).handleCommandFailure(action, message)
    },
    /**
     * 由外部诊断主动触发并锁存故障，复用统一的安全保护流程。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param faultCode 安全模块内部统一使用的故障语义编码。
     * @param detail 故障或动作的补充说明，帮助现场定位具体原因。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    tripFault(
      deviceNumber: string,
      faultCode: SafetyFaultCode,
      detail: string,
    ) {
      return getEngine(deviceNumber).tripFault(faultCode, detail)
    },
    /**
     * 重置自动控制当前状态；只清理本函数负责的数据，不会隐式启动设备。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    resetFault(deviceNumber: string) {
      return getEngine(deviceNumber).resetFault()
    },
    /**
     * 由定时器周期调用，在没有新报文时继续推进自动控制超时和时间规则。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async tick() {
      await engine?.tick()
    },
    /**
     * 按照安全顺序关闭自动控制持有的资源，并允许重复调用。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async close() {
      await engine?.close()
    },
  }
}

export type AutomationManager = ReturnType<typeof createAutomationManager>
