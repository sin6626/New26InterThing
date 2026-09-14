import cors from 'cors'
// 本质上是两行代码的合并 import express from 'express'; import type { Express } from 'express' // 只导入 TS 类型约束
import express, { type Express } from 'express'

import type { BehaviorRepository } from './modules/behavior/behavior.repository.js'
import { createBehaviorRouter } from './modules/behavior/behavior.routes.js'
import type { RecognitionService } from './modules/behavior/recognition.service.js'

import type { DeviceRepository } from './modules/device/device.repository.js'
import { createDeviceRouter } from './modules/device/device.routes.js'
import type { FaultRepository } from './modules/fault/fault.repository.js'
import { createFaultRouter } from './modules/fault/fault.routes.js'
import type { SensorHistoryRepository } from './modules/sensor-history/sensor-history.repository.js'
import { createSensorHistoryRouter } from './modules/sensor-history/sensor-history.routes.js'
import type { ControlRepository } from './modules/control/control.repository.js'
import { createControlRouter, createOperationLogRouter } from './modules/control/control.routes.js'
import type { ControlService } from './modules/control/control.service.js'
import type { AutomationManager } from './modules/automation/automation-manager.js'
import { createAutomationRouter } from './modules/automation/automation.routes.js'
import type { WaterFlowService } from './modules/water-flow/water-flow.service.js'
import type { OperationalMetricsService } from './modules/operational-metrics/operational-metrics.service.js'

interface AppDependencies {
  deviceRepository: DeviceRepository
  faultRepository: FaultRepository
  sensorHistoryRepository: SensorHistoryRepository
  behaviorRepository?: BehaviorRepository
  recognitionService?: RecognitionService
  controlRepository?: ControlRepository
  controlService?: ControlService
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
    app.use('/api/operation-logs', createOperationLogRouter(controlRepository))
  }
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
