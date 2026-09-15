/** MQTT 报文分流：设备指令反馈与传感器读数走两条不同链路。 */
import { parseDeviceReport } from '../modules/control/index.js'
import type { ControlRepository } from '../modules/control/index.js'
import { parseSensorMessage } from '../modules/realtime/index.js'
import type { createSensorRealtimeHandler } from '../modules/realtime/index.js'

// 收到Mqtt的数据进行的操作
export function createMqttDispatcher(
  controlRepository: ControlRepository,
  handleSensorReading: ReturnType<typeof createSensorRealtimeHandler>,
) {
  return async (topic: string, payload: Buffer) => {
    // 如果是发的指令推送, 也就是所谓的设备端下发的指令, 但是现在队友的设备不会发指令 
    if (topic === 'device/direct') {
      const report = parseDeviceReport(payload)
      await controlRepository.applyDeviceReport(
        report.deviceNumber,
        report.configId,
        report.value,
      )
      console.log('dispatch-mqtt.ts 21行触发了, 设备往device/direct发送数据')
      return
    }
    // device/sensor主题(因为只订阅了两个主题)
    // 刷新设备状态, online为0在线, 1为补发数据
    const result = parseSensorMessage(topic, payload)
    if (!result.accepted) {
      console.warn('忽略 MQTT 消息', {
        reason: result.reason,
        topic,
        payload: payload.toString('utf8'),
      })
      return
    }
    // 这里存数据和推送
    await handleSensorReading(result.message)
  }
}
