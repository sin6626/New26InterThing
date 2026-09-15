/** MQTT 报文分流：设备指令反馈与传感器读数走两条不同链路。 */
import { parseDeviceReport } from '../modules/control/index.js'
import type { ControlRepository } from '../modules/control/index.js'
import { parseSensorMessage } from '../modules/realtime/index.js'
import type { createSensorRealtimeHandler } from '../modules/realtime/index.js'

export function createMqttDispatcher(
  controlRepository: ControlRepository,
  handleSensorReading: ReturnType<typeof createSensorRealtimeHandler>,
) {
  return async (topic: string, payload: Buffer) => {
    if (topic === 'device/direct') {
      const report = parseDeviceReport(payload)
      await controlRepository.applyDeviceReport(
        report.deviceNumber,
        report.configId,
        report.value,
      )
      return
    }
    const result = parseSensorMessage(topic, payload)
    if (!result.accepted) {
      console.warn('忽略 MQTT 消息', {
        reason: result.reason,
        topic,
        payload: payload.toString('utf8'),
      })
      return
    }
    await handleSensorReading(result.message)
  }
}
