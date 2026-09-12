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

interface AppDependencies {
  deviceRepository: DeviceRepository
  faultRepository: FaultRepository
  sensorHistoryRepository: SensorHistoryRepository
  behaviorRepository?: BehaviorRepository
  recognitionService?: RecognitionService
}

export const createApp = ({ deviceRepository, faultRepository, sensorHistoryRepository, behaviorRepository, recognitionService }: AppDependencies): Express => {
  const app = express()

  app.use(cors())
  app.use(express.json())
  app.use('/api/devices', createDeviceRouter(deviceRepository))
  app.use('/api/faults', createFaultRouter(faultRepository))
  app.use('/api/sensor-history', createSensorHistoryRouter(sensorHistoryRepository))
  if (behaviorRepository && recognitionService) app.use('/api/behaviors', createBehaviorRouter(behaviorRepository, recognitionService))
  app.use((_request, response) => {
    response.status(404).json({ code: 404, message: '接口不存在', data: null })
  })
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error)
    response.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  })

  return app
}
