/** 设备只上报采集数据与两个开关状态；仅实际开关变化进入操作历史。 */
import type { AutomationReading } from '../automation/types.js'
import type { OperationHistoryRepository } from './types.js'

type SwitchValue = 'on' | 'off'
interface Snapshot { pump?: SwitchValue; heater?: SwitchValue }

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
