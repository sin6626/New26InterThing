import type { SensorRealtimeMessage } from '@new26interthing/shared'

import type { ParsedSensorMessage } from './sensor-message.js'
import type { SensorRepository } from './sensor.repository.js'

interface SensorRealtimeHandlerDependencies {
  repository: SensorRepository
  broadcast(message: SensorRealtimeMessage): void
}

export const createSensorRealtimeHandler = ({
  repository,
  broadcast,
}: SensorRealtimeHandlerDependencies) => {
  return async (message: ParsedSensorMessage) => {
    const savedReading = await repository.save(message)
    broadcast({ type: 'sensor.realtime', data: savedReading })
  }
}
