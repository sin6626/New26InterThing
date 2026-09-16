/**
 * 阅读导航：温控需求流程：按回差或 PID 计算想要的加热状态，先请求安全授权再调用执行器；想开加热不等于可以开加热。
 * 入口位置：modules/automation/flows/demand.ts
 */

import type {
  ActuatorValue,
  AutomationState,
  PidSnapshot,
} from '@new26interthing/shared'

import type { SafetyAuthorization } from '../../safety/types.js'
import {
  createTemperatureController,
  hysteresisDemand,
} from '../rules/temperature.js'
import type { AutomationConfig } from '../types.js'

interface Dependencies {
  clock(): number
  getDesiredHeater(): ActuatorValue
  authorize(value: ActuatorValue): SafetyAuthorization
  run(value: ActuatorValue): Promise<void>
  setLimitation(reason: string | null): void
  onFailure(error: unknown): Promise<void>
}

/** 根据状态机状态和出口温度计算加热需求，并通过安全授权后执行。 */
export const createAutomationTemperatureDemand = ({
  clock,
  getDesiredHeater,
  authorize,
  run,
  setLimitation,
  onFailure,
}: Dependencies) => {
  const controller = createTemperatureController(clock)
  let pid: PidSnapshot | null = null

  /**
   * 向外部通道发布自动控制指令，发布失败会交给调用方处理。
   * @param value 本次准备读取、转换或保存的值。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const publishAuthorized = async (value: ActuatorValue) => {
    const authorization = authorize(value)
    if (!authorization.allowed) {
      setLimitation(authorization.reason)
      try {
        await run('off')
      }
      catch (error) {
        await onFailure(error)
      }
      return
    }
    try {
      await run(value)
    }
    catch (error) {
      await onFailure(error)
    }
  }

  return {
    get pid() {
      return pid
    },
    /**
     * 重置自动控制当前状态；只清理本函数负责的数据，不会隐式启动设备。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    reset() {
      controller.reset()
      pid = null
    },
    /**
     * 更新自动控制状态，并返回或广播更新后的结果。
     * @param state 当前设备或状态机的内部状态。
     * @param config 从后台配置读取并校验后的业务参数。
     * @param outletTemperature 本次读数中的出口温度，缺失时为空值。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async update(
      state: AutomationState,
      config: AutomationConfig | null,
      outletTemperature: number | null,
    ) {
      if (!config) return
      if (state !== 'running') {
        if (getDesiredHeater() === 'on') await publishAuthorized('on')
        return
      }
      if (outletTemperature === null) return
      if (config.strategy === 'pid') {
        pid = controller.update(
          outletTemperature,
          config.pid,
          getDesiredHeater(),
        )
        setLimitation(pid.limitationReason)
        await publishAuthorized(pid.desired)
        return
      }
      const demand = hysteresisDemand(
        outletTemperature,
        config.targetTemperature,
        config.temperatureHysteresis,
        getDesiredHeater(),
      )
      await publishAuthorized(demand)
    },
  }
}
