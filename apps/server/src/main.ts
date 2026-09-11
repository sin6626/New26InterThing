import { createServer } from 'node:http'

import { createApp } from './app.js'
import { readEnv } from './config/env.js'
import { createDatabasePool } from './infrastructure/database.js'
import { createSensorMqtt } from './infrastructure/mqtt/sensor-mqtt.js'
import { createRealtimeWebSocket } from './infrastructure/websocket/realtime-websocket.js'
import { createDeviceRepository } from './modules/device/device.repository.js'
import { createSensorRealtimeHandler } from './modules/realtime/sensor-realtime-handler.js'
import { parseSensorMessage } from './modules/realtime/sensor-message.js'
import { createSensorRepository } from './modules/realtime/sensor.repository.js'
import { createSensorHistoryRepository } from './modules/sensor-history/sensor-history.mysql.js'

const env = readEnv()
const pool = createDatabasePool(env)
const app = createApp({
  deviceRepository: createDeviceRepository(pool),
  sensorHistoryRepository: createSensorHistoryRepository(pool),
})
const server = createServer(app)
const realtimeWebSocket = createRealtimeWebSocket(server)
const handleSensorReading = createSensorRealtimeHandler({
  repository: createSensorRepository(pool),
  broadcast: (message) => realtimeWebSocket.broadcast(message),
})
const sensorMqtt = createSensorMqtt({
  env,
  onConnectionChange: (connected) => realtimeWebSocket.setMqttConnected(connected),
  async onMessage(topic, payload) {
    const result = parseSensorMessage(topic, payload)
    if (!result.accepted) {
      console.warn(`忽略 MQTT 消息：${result.reason}`)
      return
    }
    await handleSensorReading(result.message)
  },
})

server.listen(env.SERVER_PORT, env.SERVER_HOST, () => {
  console.log(`后端已启动：http://${env.SERVER_HOST}:${env.SERVER_PORT}`)
})

let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  await sensorMqtt.close()
  realtimeWebSocket.close(() => server.close())
  await pool.end()
}

process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
