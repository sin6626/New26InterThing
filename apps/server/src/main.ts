import { createServer } from 'node:http'

import { createApp } from './app.js'
import { readEnv } from './config/env.js'
import { createDatabasePool } from './infrastructure/database.js'
import { createSensorMqtt } from './infrastructure/mqtt/sensor-mqtt.js'
import { createRealtimeWebSocket } from './infrastructure/websocket/realtime-websocket.js'
import { createDeviceRepository } from './modules/device/device.repository.js'
import { createDevicePresenceService } from './modules/device/device-presence.service.js'
import { createHydraulicDiagnosisManager } from './modules/diagnostics/hydraulic-diagnosis-manager.js'
import { createMonitoringConfigLoader } from './modules/diagnostics/monitoring-config.js'
import { createBehaviorRepository } from './modules/behavior/behavior.mysql.js'
import { createRecognitionService } from './modules/behavior/recognition.service.js'
import { createFaultRepository } from './modules/fault/fault.mysql.js'
import { createFaultReporter } from './modules/fault/fault-reporter.js'
import { createSensorRealtimeHandler } from './modules/realtime/sensor-realtime-handler.js'
import { parseSensorMessage } from './modules/realtime/sensor-message.js'
import { createSensorRepository } from './modules/realtime/sensor.repository.js'
import { createSensorVstatusEvaluator } from './modules/realtime/sensor-vstatus.js'
import { createSensorHistoryRepository } from './modules/sensor-history/sensor-history.mysql.js'
import { createOperationalMetricsService } from './modules/operational-metrics/operational-metrics.service.js'
import { createControlRepository } from './modules/control/control.mysql.js'
import { createControlService } from './modules/control/control.service.js'
import { parseDeviceReport } from './modules/control/device-report.js'
import { createAutomationConfigLoader } from './modules/automation/control-config.js'
import { createAutomationManager } from './modules/automation/automation-manager.js'
import { normalizeAutomationReading } from './modules/automation/automation-reading.js'
import {
  getHydraulicFaultType,
  getSafetyFaultType,
} from './modules/safety/safety-fault-catalog.js'
import {
  createPipeDiameterLoader,
  createWaterFlowRepository,
} from './modules/water-flow/water-flow.mysql.js'
import { createWaterFlowService } from './modules/water-flow/water-flow.service.js'

/**
 * 后端组合根：只负责把数据库、MQTT、WebSocket 和业务模块连接起来。
 * 实时主链路为：device/sensor → 解析 → 历史入库 → WebSocket →
 * 运行指标/累计量 → 自动控制 → 水力诊断。
 */
const env = readEnv()
const pool = createDatabasePool(env)
const faultRepository = createFaultRepository(pool)
const behaviorRepository = createBehaviorRepository(pool)
const controlRepository = createControlRepository(pool)
const loadMonitoringConfig = createMonitoringConfigLoader(pool)
const loadAutomationConfig = createAutomationConfigLoader(pool)
const faultReporter = createFaultReporter({
  repository: faultRepository,
  broadcast: message => realtimeWebSocket.broadcast(message),
})
const devicePresence = createDevicePresenceService({
  loadOfflineTimeoutSeconds: async () => (
    await loadMonitoringConfig()
  ).deviceOfflineTimeoutSeconds,
  emit: message => realtimeWebSocket.broadcast(message),
  reportOffline: async (deviceNumber, detail) => {
    await faultReporter.reportFault({
      deviceNumber,
      errorNumber: 'E002',
      type: '2',
      detail,
    })
  },
})
const hydraulicDiagnosis = createHydraulicDiagnosisManager({
  loadConfig: loadMonitoringConfig,
  emit: message => realtimeWebSocket.broadcast(message),
  protect: async (diagnosis) => {
    if (diagnosis.code !== 'HYDRAULIC_LEAK_OR_BURST') return
    await automationManager.tripFault(
      diagnosis.deviceNumber,
      'LOW_FLOW',
      `水力骤降：${diagnosis.detail}`,
    )
  },
  reportFault: async (deviceNumber, code, detail) => {
    await faultReporter.reportFault({
      deviceNumber,
      errorNumber: code,
      type: getHydraulicFaultType(code),
      detail,
    })
  },
})
let sensorMqtt: ReturnType<typeof createSensorMqtt>
let automationManager: ReturnType<typeof createAutomationManager>
const controlService = createControlService(controlRepository, {
  publish: (topic, payload) => sensorMqtt.publish(topic, payload),
}, {
  setEnabled: (deviceNumber, enabled) => (
    automationManager.setEnabled(deviceNumber, enabled)
  ),
  executeAction: (deviceNumber, action, publish) => (
    automationManager.executeAction(deviceNumber, action, publish)
  ),
})
const waterFlowService = createWaterFlowService({
  repository: createWaterFlowRepository(pool),
  loadPipeDiameter: createPipeDiameterLoader(pool),
})
const operationalMetricsService = createOperationalMetricsService({
  loadDataTimeoutSeconds: async () => (
    await loadMonitoringConfig()
  ).dataTimeoutSeconds,
})
automationManager = createAutomationManager({
  loadConfig: loadAutomationConfig,
  waterFlow: waterFlowService,
  emit: message => realtimeWebSocket.broadcast(message),
  async disableMaster(deviceNumber, reason) {
    const definition = await controlRepository.getDefinitionByTopic?.('master')
    if (!definition) throw new Error('未配置 master 自动模式')
    await controlRepository.saveSuccess(
      definition,
      deviceNumber,
      'off',
      `自动启动失败：${reason}`,
    )
  },
  async execute(deviceNumber, topic, value) {
    const definition = await controlRepository.getDefinitionByTopic?.(topic)
    if (!definition) throw new Error(`未配置 ${topic} 设备指令`)
    await controlService.executeAutomation({
      deviceNumber,
      configId: definition.configId,
      value,
    })
  },
  async reportFault(deviceNumber, errorNumber, detail) {
    await faultReporter.reportFault({
      deviceNumber,
      errorNumber,
      type: getSafetyFaultType(errorNumber),
      detail,
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
  operationalMetricsService,
})
const server = createServer(app)
const realtimeWebSocket = createRealtimeWebSocket(server)
const handleSensorReading = createSensorRealtimeHandler({
  repository: createSensorRepository(
    pool,
    createSensorVstatusEvaluator(loadMonitoringConfig),
  ),
  broadcast: (message) => realtimeWebSocket.broadcast(message),
  onRealtimeReceived: message => devicePresence.recordActivity(message.deviceNumber),
  afterSave: [
    // 第一条后处理链维护控制所需的实时状态：运行指标、累计水量和自动状态机。
    async (message) => {
      const receivedAt = Date.now()
      const reading = normalizeAutomationReading(message.values, receivedAt)
      const operationalMetrics = await operationalMetricsService.handleReading(
        message.deviceNumber,
        reading,
      )
      realtimeWebSocket.broadcast({
        type: 'operational-metrics.realtime',
        data: operationalMetrics,
      })
      if (reading.flowRate !== null && reading.flowRate >= 0) {
        const snapshot = await waterFlowService.handleReading(
          message.deviceNumber,
          reading.flowRate,
          receivedAt,
        )
        realtimeWebSocket.broadcast({
          type: 'water-flow.realtime',
          data: snapshot,
        })
      }
      await automationManager.handleReading(message.deviceNumber, reading)
    },
    // 水力诊断独立于自动状态机，诊断规则不会反向污染传感器入库结果。
    async (message) => {
      const reading = normalizeAutomationReading(message.values, Date.now())
      const automation = await automationManager.getSnapshot(message.deviceNumber)
      await hydraulicDiagnosis.handleReading(
        message.deviceNumber,
        reading,
        automation.state,
      )
    },
  ],
})
sensorMqtt = createSensorMqtt({
  env,
  onConnectionChange: (connected) => realtimeWebSocket.setMqttConnected(connected),
  async onMessage(topic, payload) {
    // device/direct 是设备执行回报，不是传感器数据，因此必须走独立解析器。
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
  // 没有新报文时，超时保护、冷却计时和设备离线判断仍需每秒推进。
  void automationManager.tick().catch((error) => {
    console.error('自动控制定时推进失败', error)
  })
  void devicePresence.tick().catch((error) => {
    console.error('设备离线巡检失败', error)
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
