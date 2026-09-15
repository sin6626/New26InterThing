/**
 * 阅读导航：程序组合根：创建 MySQL、MQTT、WebSocket，再把业务模块接成实时链路。重点区分 Broker 发布成功、设备真实反馈和安全决策，它们不是同一件事。
 * 
 */

import { createServer } from 'node:http'

import { createApp } from '../app.js'
import { readEnv } from '../config/env.js'
import { createDatabasePool } from '../infrastructure/database.js'
import { createSensorMqtt } from '../infrastructure/mqtt/sensor-mqtt.js'
import { createRealtimeWebSocket } from '../infrastructure/websocket/realtime-websocket.js'
import { createDeviceRepository, createDevicePresenceService } from '../modules/device/index.js'
import { createHydraulicDiagnosisManager } from '../modules/diagnostics/index.js'
import { createMonitoringConfigLoader } from '../modules/monitoring-config/index.js'
import { createBehaviorRepository, createRecognitionService } from '../modules/behavior/index.js'
import { createFaultRepository, createFaultReporter } from '../modules/fault/index.js'
import {
  createSensorRealtimeHandler,
  createSensorRepository,
  createSensorVstatusEvaluator,
} from '../modules/realtime/index.js'
import { createSensorHistoryRepository } from '../modules/sensor-history/index.js'
import { createOperationalMetricsService } from '../modules/operational-metrics/index.js'
import { createControlRepository, createControlService } from '../modules/control/index.js'
import {
  createAutomationConfigLoader,
  createAutomationManager,
} from '../modules/automation/index.js'
import {
  getHydraulicFaultType,
  getSafetyFaultType,
} from '../modules/safety/index.js'
import {
  createPipeDiameterLoader,
  createWaterFlowRepository,
  createWaterFlowService,
} from '../modules/water-flow/index.js'
import { createRealtimeConsumers } from './realtime-consumers.js'
import { createMqttDispatcher } from './dispatch-mqtt.js'

/**
 * 后端组合根：只负责把数据库、MQTT、WebSocket 和业务模块连接起来。
 * 实时主链路为：device/sensor → 解析 → 历史入库 → WebSocket →
 * 运行指标/累计量 → 自动控制 → 水力诊断。
 */
export function createRuntime() {
const env = readEnv()
const pool = createDatabasePool(env)
// MySQL 仓储是“读写数据”的适配器；下面的业务流程通过仓储接口使用数据，
// 不需要知道连接池、SQL 表名或字段映射的具体细节。
const faultRepository = createFaultRepository(pool)
const behaviorRepository = createBehaviorRepository(pool)
const controlRepository = createControlRepository(pool)
const loadMonitoringConfig = createMonitoringConfigLoader(pool)
const loadAutomationConfig = createAutomationConfigLoader(pool)
// 注册故障告警, 入库 + websocket推送
const faultReporter = createFaultReporter({
  repository: faultRepository,
  broadcast: message => realtimeWebSocket.broadcast(message),
})
// 注册设备各个传感器状态, 离线推送
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
// 注册水力联合诊断
const hydraulicDiagnosis = createHydraulicDiagnosisManager({
  loadConfig: loadMonitoringConfig,
  emit: message => realtimeWebSocket.broadcast(message),
  protect: async (diagnosis) => {
    await automationManager.tripFault(
      diagnosis.deviceNumber,
      'LOW_FLOW',
      `水力骤降：${diagnosis.detail}`,
    )
  },
  // 推送报错, 上文的告警
  reportFault: async (deviceNumber, code, detail) => {
    await faultReporter.reportFault({
      deviceNumber,
      errorNumber: code,
      type: getHydraulicFaultType(code),
      detail,
    })
  },
})

// 自动推导类型, 单纯两个方法, 一个推送, 一个关闭的方法
let sensorMqtt: ReturnType<typeof createSensorMqtt>
let automationManager: ReturnType<typeof createAutomationManager>
// 控制业务通过下面的适配回调连接 MQTT 和自动状态机。
const controlService = createControlService(controlRepository, {
  publish: (topic, payload) => sensorMqtt.publish(topic, payload),
}, {
  // 控制模式下, 控制手动和自动模式
  // 手动模式enable是true, 自动为false
  setEnabled: (deviceNumber, enabled) => (
    automationManager.setEnabled(deviceNumber, enabled)
  ),
  // 模式下的发送数据, 手动模式就是两个指令开关, 自动模式自动控制
  executeAction: (deviceNumber, action, publish) => (
    automationManager.executeAction(deviceNumber, action, publish)
  ),
})
// 累计流量相关Service层
const waterFlowService = createWaterFlowService({
  // 注册流量库, 查累计流量表
  repository: createWaterFlowRepository(pool),
  // 指令表查内径
  loadPipeDiameter: createPipeDiameterLoader(pool),
})
// 水泵, 加热时间累计, 内存算, 跟指令控制层的配置联动, 内部会查表
const operationalMetricsService = createOperationalMetricsService({
  loadDataTimeoutSeconds: async () => (
    await loadMonitoringConfig()
  ).dataTimeoutSeconds,
})
// 自动模式逻辑层
automationManager = createAutomationManager({
  loadConfig: loadAutomationConfig,
  waterFlow: waterFlowService,
  emit: message => realtimeWebSocket.broadcast(message),
  async disableMaster(deviceNumber, reason) {
    // 对控制模式控制
    const definition = await controlRepository.getDefinitionByTopic?.('master')
    if (!definition) throw new Error('未配置 master 自动模式')
    await controlRepository.saveSuccess(
      definition,
      deviceNumber,
      'off',
      `自动启动失败：${reason}`,
    )
  },
  // 自动模式下指令, 还是复用之前的control发指令
  async execute(deviceNumber, topic, value) {
    const definition = await controlRepository.getDefinitionByTopic?.(topic)
    if (!definition) throw new Error(`未配置 ${topic} 设备指令`)
    await controlService.executeAutomation({
      deviceNumber,
      configId: definition.configId,
      value,
    })
  },
  // 推送错误, 也是复用之前
  async reportFault(deviceNumber, errorNumber, detail) {
    await faultReporter.reportFault({
      deviceNumber,
      errorNumber,
      type: getSafetyFaultType(errorNumber),
      detail,
    })
  },
})
// 服务都挂在到主应用, 下面都是挂在服务和关闭
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
  // 设备包首先保存进历史表。vstatus 是后端根据当前阈值计算的历史标记，
  // 与设备是否在线、自动控制是否要动作是不同用途。
  repository: createSensorRepository(
    pool,
    createSensorVstatusEvaluator(loadMonitoringConfig),
  ),
  broadcast: (message) => realtimeWebSocket.broadcast(message),
  onRealtimeReceived: message => devicePresence.recordActivity(message.deviceNumber),
  afterSave: createRealtimeConsumers({
    automation: automationManager,
    hydraulicDiagnosis,
    operationalMetrics: operationalMetricsService,
    waterFlow: waterFlowService,
    websocket: realtimeWebSocket,
  }),
})
sensorMqtt = createSensorMqtt({
  env,
  onConnectionChange: (connected) => realtimeWebSocket.setMqttConnected(connected),
  onMessage: createMqttDispatcher(controlRepository, handleSensorReading),
})

let automationTimer: ReturnType<typeof setInterval> | undefined
const start = () => {
  server.listen(env.SERVER_PORT, env.SERVER_HOST, () => {
    console.log(`后端已启动：http://${env.SERVER_HOST}:${env.SERVER_PORT}`)
  })
  automationTimer = setInterval(() => {
  // 没有新报文时，超时保护、冷却计时和设备离线判断仍需每秒推进。
  void automationManager.tick().catch((error) => {
    console.error('自动控制定时推进失败', error)
  })
  void devicePresence.tick().catch((error) => {
    console.error('设备离线巡检失败', error)
  })
  }, 1_000)
}

let stopping = false
const stop = async () => {
  // 停止顺序很重要：先关闭自动动作，再断开 MQTT；否则停机指令可能无法发布。
  // stopping 保护多种退出信号同时到达时不重复关闭同一资源。
  if (stopping) return
  stopping = true
  if (automationTimer) clearInterval(automationTimer)
  await automationManager.close()
  await sensorMqtt.close()
  realtimeWebSocket.close(() => server.close())
  await pool.end()
}

// 优化的停止进程的写法, 防止进程残留(确实遇到过这样的问题....)
// Singal Interrupt, 就是在终端按ctrl + c, Singal Terminate, 是docker容器停止, kill <pid>, PM2重启或者系统关机时发送
// 这里的stop是一个异步函数, 这里使用void去做装饰, 是去告诉Ts检查器这里不用返回值
return { start, stop }
}
