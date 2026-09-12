import { createServer } from 'node:http'

import { createApp } from './app.js'
import { readEnv } from './config/env.js'
import { createDatabasePool } from './infrastructure/database.js'
import { createSensorMqtt } from './infrastructure/mqtt/sensor-mqtt.js'
import { createRealtimeWebSocket } from './infrastructure/websocket/realtime-websocket.js'
import { createDeviceRepository } from './modules/device/device.repository.js'
import { createBehaviorRepository } from './modules/behavior/behavior.mysql.js'
import { createRecognitionService } from './modules/behavior/recognition.service.js'
import { createFaultRepository } from './modules/fault/fault.mysql.js'
import { createSensorRealtimeHandler } from './modules/realtime/sensor-realtime-handler.js'
import { parseSensorMessage } from './modules/realtime/sensor-message.js'
import { createSensorRepository } from './modules/realtime/sensor.repository.js'
import { createSensorHistoryRepository } from './modules/sensor-history/sensor-history.mysql.js'
import { createControlRepository } from './modules/control/control.mysql.js'
import { createControlService } from './modules/control/control.service.js'
import { parseDeviceReport } from './modules/control/device-report.js'
import { createAutomationConfigLoader } from './modules/automation/control-config.js'
import { createAutomationManager } from './modules/automation/automation-manager.js'
import {
  createPipeDiameterLoader,
  createWaterFlowRepository,
} from './modules/water-flow/water-flow.mysql.js'
import { createWaterFlowService } from './modules/water-flow/water-flow.service.js'

const env = readEnv()
const pool = createDatabasePool(env)
const faultRepository = createFaultRepository(pool)
const behaviorRepository = createBehaviorRepository(pool)
const controlRepository = createControlRepository(pool)
let sensorMqtt: ReturnType<typeof createSensorMqtt>
let automationManager: ReturnType<typeof createAutomationManager>
const controlService = createControlService(controlRepository, {
  publish: (topic, payload) => sensorMqtt.publish(topic, payload),
}, {
  setEnabled: (deviceNumber, enabled) => (
    automationManager.setEnabled(deviceNumber, enabled)
  ),
})
const waterFlowService = createWaterFlowService({
  repository: createWaterFlowRepository(pool),
  loadPipeDiameter: createPipeDiameterLoader(pool),
})
automationManager = createAutomationManager({
  loadConfig: createAutomationConfigLoader(pool),
  waterFlow: waterFlowService,
  emit: message => realtimeWebSocket.broadcast(message),
  async execute(deviceNumber, topic, value) {
    const definition = await controlRepository.getDefinitionByTopic?.(topic)
    if (!definition) throw new Error(`未配置 ${topic} 设备指令`)
    await controlService.execute({
      deviceNumber,
      configId: definition.configId,
      value,
    })
  },
})
const app = createApp({
  deviceRepository: createDeviceRepository(pool),
  faultRepository,
  sensorHistoryRepository: createSensorHistoryRepository(pool),
  behaviorRepository,
  recognitionService: createRecognitionService(behaviorRepository),
  controlRepository,
  controlService,
  automationManager,
  waterFlowService,
})
const server = createServer(app)
const realtimeWebSocket = createRealtimeWebSocket(server)
const handleSensorReading = createSensorRealtimeHandler({
  repository: createSensorRepository(pool),
  broadcast: (message) => realtimeWebSocket.broadcast(message),
  afterSave: [
    async (message) => {
      const rawFlow = message.values.flow_rate ?? message.values.field5
      const flow = Number(rawFlow)
      if (!Number.isFinite(flow) || flow < 0) return
      const recordedAt = new Date(message.recordedAt.replace(' ', 'T')).getTime()
      const snapshot = await waterFlowService.handleReading(
        message.deviceNumber,
        flow,
        Number.isFinite(recordedAt) ? recordedAt : Date.now(),
      )
      realtimeWebSocket.broadcast({
        type: 'water-flow.realtime',
        data: snapshot,
      })
    },
    async (message) => {
      const actuator = (value: unknown) => {
        if (value === 'on' || value === 1 || value === '1' || value === true) return 'on' as const
        if (value === 'off' || value === 0 || value === '0' || value === false) return 'off' as const
        return 'unknown' as const
      }
      const numeric = (value: unknown) => {
        const parsed = Number(value)
        return Number.isFinite(parsed) ? parsed : null
      }
      await automationManager.handleReading(message.deviceNumber, {
        recordedAt: Date.now(),
        flowRate: numeric(message.values.flow_rate ?? message.values.field5),
        outletTemperature: numeric(message.values.temp_out ?? message.values.field4),
        actualPump: actuator(message.values.water_Y2),
        actualHeater: actuator(message.values.heat_Y1),
      })
    },
  ],
})
sensorMqtt = createSensorMqtt({
  env,
  onConnectionChange: (connected) => realtimeWebSocket.setMqttConnected(connected),
  async onMessage(topic, payload) {
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
  },
})

server.listen(env.SERVER_PORT, env.SERVER_HOST, () => {
  console.log(`后端已启动：http://${env.SERVER_HOST}:${env.SERVER_PORT}`)
})

const automationTimer = setInterval(() => {
  void automationManager.tick().catch((error) => {
    console.error('自动控制定时推进失败', error)
  })
}, 1_000)

let stopping = false
const stop = async () => {
  if (stopping) return
  stopping = true
  clearInterval(automationTimer)
  await automationManager.close()
  await sensorMqtt.close()
  realtimeWebSocket.close(() => server.close())
  await pool.end()
}

// 优化的停止进程的写法, 防止进程残留(确实遇到过这样的问题....)
// Singal Interrupt, 就是在终端按ctrl + c, Singal Terminate, 是docker容器停止, kill <pid>, PM2重启或者系统关机时发送
// 这里的stop是一个异步函数, 这里使用void去做装饰, 是去告诉Ts检查器这里不用返回值
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())
