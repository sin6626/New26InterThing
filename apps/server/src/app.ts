import cors from 'cors'
import express, { type Express } from 'express'

import type { DeviceRepository } from './modules/device/device.repository.js'
import { createDeviceRouter } from './modules/device/device.routes.js'

interface AppDependencies {
  deviceRepository: DeviceRepository
  webOrigin?: string
}

export const createApp = ({ deviceRepository, webOrigin = 'http://localhost:5174' }: AppDependencies): Express => {
  const app = express()

  app.use(cors({ origin: webOrigin }))
  app.use(express.json())
  app.use('/api/devices', createDeviceRouter(deviceRepository))
  app.use((_request, response) => {
    response.status(404).json({ code: 404, message: '接口不存在', data: null })
  })
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    console.error(error)
    response.status(500).json({ code: 500, message: '服务器内部错误', data: null })
  })

  return app
}
