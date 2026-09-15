import type { SensorRealtimeMessage } from '@new26interthing/shared'

import type { ParsedSensorMessage } from './sensor-message.js'
import type { SensorRepository } from './sensor.repository.js'

interface SensorRealtimeHandlerDependencies {
  repository: SensorRepository
  broadcast(message: SensorRealtimeMessage): void
  onRealtimeReceived?: (message: ParsedSensorMessage) => void
  afterSave?: Array<(message: ParsedSensorMessage) => Promise<void>>
}

export const createSensorRealtimeHandler = ({
  repository,
  broadcast,
  onRealtimeReceived = () => {},
  afterSave = [],
}: SensorRealtimeHandlerDependencies) => {
  /**
   * 传感器消息进入系统后的统一入口。
   * 所有消息都先入历史库；只有实时消息才刷新在线状态、推送页面并驱动控制。
   * 补发消息只补齐历史，不能用过去的数据“倒放”自动控制。
   */
  return async (message: ParsedSensorMessage) => {
    if (message.dataKind === 'realtime') onRealtimeReceived(message)
    const savedReading = await repository.save(message)
    if (message.dataKind === 'backfill') return
    broadcast({ type: 'sensor.realtime', data: savedReading })
    for (const consume of afterSave) {
      try {
        await consume(message)
      }
      catch (error) {
        console.error('实时数据派生处理失败', error)
      }
    }
  }
}
