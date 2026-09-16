/**
 * 阅读导航：HTTP 应用入口：把各业务路由挂到 Express；它只连接模块，不决定设备如何运行。阅读时从 createApp 的依赖开始，看每条路由由哪个模块负责。
 * 入口位置：app.ts
 */

import cors from 'cors'
// 本质上是两行代码的合并 import express from 'express'; import type { Express } from 'express' // 只导入 TS 类型约束
import express, { type Express } from 'express'

import { createBehaviorRouter, type BehaviorRepository, type RecognitionService } from './modules/behavior/index.js'

import { createDeviceRouter, type DeviceRepository } from './modules/device/index.js'
import { createFaultRouter, type FaultRepository } from './modules/fault/index.js'
import { createSensorHistoryRouter, type SensorHistoryRepository } from './modules/sensor-history/index.js'
import {
  createControlRouter,
  createOperationLogRouter,
  type ControlRepository,
  type ControlService,
} from './modules/control/index.js'
import { createAutomationRouter, type AutomationManager } from './modules/automation/index.js'
import type { WaterFlowService } from './modules/water-flow/index.js'
import type { OperationalMetricsService } from './modules/operational-metrics/index.js'
import type { OperationHistoryRepository } from './modules/operation-history/index.js'

interface AppDependencies {
  deviceRepository: DeviceRepository
  faultRepository: FaultRepository
  sensorHistoryRepository: SensorHistoryRepository
  behaviorRepository?: BehaviorRepository
  recognitionService?: RecognitionService
  controlRepository?: ControlRepository
  controlService?: ControlService
  operationHistory?: OperationHistoryRepository
  automationManager?: AutomationManager
  waterFlowService?: WaterFlowService
  operationalMetricsService?: OperationalMetricsService
}

export const createApp = ({
  deviceRepository,
  faultRepository,
  sensorHistoryRepository,
  behaviorRepository,
  recognitionService,
  controlRepository,
  controlService,
  operationHistory,
  automationManager,
  waterFlowService,
  operationalMetricsService,
}: AppDependencies): Express => {
  const app = express()

  app.use(cors())
  app.use(express.json())
  app.use('/api/devices', createDeviceRouter(deviceRepository))
  app.use('/api/faults', createFaultRouter(faultRepository))
  app.use('/api/sensor-history', createSensorHistoryRouter(sensorHistoryRepository))
  if (behaviorRepository && recognitionService) app.use('/api/behaviors', createBehaviorRouter(behaviorRepository, recognitionService))
  if (controlRepository && controlService) {
    app.use('/api/controls', createControlRouter(controlRepository, controlService))
  }
  if (operationHistory) app.use('/api/operation-logs', createOperationLogRouter(operationHistory))
  if (
    automationManager
    && waterFlowService
    && controlRepository
    && controlService
  ) {
    app.use(
      '/api/automation',
      createAutomationRouter(
        automationManager,
        controlService,
        controlRepository,
        waterFlowService,
        operationalMetricsService,
        operationHistory,
      ),
    )
  }
  app.use((_request, response) => {
    response.status(404).json({ code: 404, message: '接口不存在', data: null })
  })
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error)
    response.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  })

  return app
}
