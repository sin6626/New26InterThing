import type { SensorRealtimeMessage } from '@new26interthing/shared'

import type { ParsedSensorMessage } from './sensor-message.js'
import type { SensorRepository } from './sensor.repository.js'

interface SensorRealtimeHandlerDependencies {
  repository: SensorRepository
  broadcast(message: SensorRealtimeMessage): void
  afterSave?: Array<(message: ParsedSensorMessage) => Promise<void>>
}

export const createSensorRealtimeHandler = ({
  repository,
  broadcast,
  afterSave = [],
}: SensorRealtimeHandlerDependencies) => {
  return async (message: ParsedSensorMessage) => {
    const savedReading = await repository.save(message)
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
