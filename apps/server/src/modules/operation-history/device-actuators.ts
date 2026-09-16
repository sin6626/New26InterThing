/** 设备只上报采集数据与两个开关状态；仅实际开关变化进入操作历史。 */
import type { AutomationReading } from '../automation/types.js'
import type { OperationHistoryRepository } from './types.js'

type SwitchValue = 'on' | 'off'
interface Snapshot { pump?: SwitchValue; heater?: SwitchValue }

/**
 * 创建操作历史模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param history 操作历史仓储，用于记录本次动作的来源和结果。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createDeviceActuatorHistory = (history: OperationHistoryRepository) => {
  const previous = new Map<string, Snapshot>()

  return async (deviceNumber: string, reading: AutomationReading) => {
    const snapshot = previous.get(deviceNumber) ?? {}
    for (const [key, value, name, type] of [
      ['pump', reading.actualPump, '水泵开关', 'pump'],
      ['heater', reading.actualHeater, '加热开关', 'heater'],
    ] as const) {
      if (value === 'unknown') continue
      const oldValue = snapshot[key]
      if (oldValue && oldValue !== value) {
        await history.record({
          source: 'device', commandType: type, deviceNumber,
          commandName: name, oldValue, newValue: value,
          result: 'success',
        })
      }
      snapshot[key] = value
      previous.set(deviceNumber, snapshot)
    }
  }
}
