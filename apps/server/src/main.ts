import { createServer } from 'node:http'

import { createApp } from './app.js'
import { readEnv } from './config/env.js'
import { createDatabasePool } from './infrastructure/database.js'
import { createSensorMqtt } from './infrastructure/mqtt/sensor-mqtt.js'
import { createRealtimeWebSocket } from './infrastructure/websocket/realtime-websocket.js'
import { createDeviceRepository } from './modules/device/device.repository.js'
import { createFaultHandler } from './modules/fault/fault-handler.js'
import { createFaultRepository } from './modules/fault/fault.mysql.js'
import { FAULT_TOPIC, parseFaultMessage } from './modules/fault/fault-message.js'
import { createSensorRealtimeHandler } from './modules/realtime/sensor-realtime-handler.js'
import { parseSensorMessage } from './modules/realtime/sensor-message.js'
import { createSensorRepository } from './modules/realtime/sensor.repository.js'
import { createSensorHistoryRepository } from './modules/sensor-history/sensor-history.mysql.js'

const env = readEnv()
const pool = createDatabasePool(env)
const faultRepository = createFaultRepository(pool)
const app = createApp({
  deviceRepository: createDeviceRepository(pool),
  faultRepository,
  sensorHistoryRepository: createSensorHistoryRepository(pool),
})
const server = createServer(app)
const realtimeWebSocket = createRealtimeWebSocket(server)
const handleSensorReading = createSensorRealtimeHandler({
  repository: createSensorRepository(pool),
  broadcast: (message) => realtimeWebSocket.broadcast(message),
})
const handleFault = createFaultHandler(faultRepository)
const sensorMqtt = createSensorMqtt({
  env,
  onConnectionChange: (connected) => realtimeWebSocket.setMqttConnected(connected),
  async onMessage(topic, payload) {
    if (topic === FAULT_TOPIC) {
      const result = parseFaultMessage(topic, payload)
      if (!result.accepted) {
        console.warn(`忽略 MQTT 消息：${result.reason}`)
        return
      }
      await handleFault(result.message)
      return
    }
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

// 优化的停止进程的写法, 防止进程残留(确实遇到过这样的问题....)
// Singal Interrupt, 就是在终端按ctrl + c, Singal Terminate, 是docker容器停止, kill <pid>, PM2重启或者系统关机时发送
// 这里的stop是一个异步函数, 这里使用void去做装饰, 是去告诉Ts检查器这里不用返回值
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
