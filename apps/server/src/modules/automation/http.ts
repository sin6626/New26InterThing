import {
  Router,
  type NextFunction,
  type Response,
} from 'express'

import type { ControlRepository } from '../control/types.js'
import {
  ControlError,
  type ControlService,
} from '../control/flows/execute.js'
import type { WaterFlowService } from '../water-flow/accumulate.js'
import type { OperationalMetricsService } from '../operational-metrics/runtime.js'
import type { AutomationManager } from './flows/manager.js'
import { AutomationError } from './types.js'

export const createAutomationRouter = (
  manager: AutomationManager,
  controls: ControlService,
  controlRepository: ControlRepository,
  waterFlow: WaterFlowService,
  operationalMetrics?: OperationalMetricsService,
) => {
  const router = Router()

  router.get('/debug-mode', (_request, response) => {
    response.json({ code: 0, message: '操作成功', data: manager.getDebugMode() })
  })

  router.post('/debug-mode', (request, response, next) => {
    void manager.setDebugMode(request.body?.enabled === true)
      .then(data => response.json({ code: 0, message: '调试模式已更新', data }))
      .catch(next)
  })

  const handleKnownError = (
    error: unknown,
    response: Response,
    next: NextFunction,
  ) => {
    if (error instanceof AutomationError || error instanceof ControlError) {
      response.status(error.status).json({
        code: error.status,
        message: error.message,
        data: null,
      })
      return
    }
    next(error)
  }

  router.get('/:deviceNumber', async (request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '操作成功',
        data: await manager.getSnapshot(request.params.deviceNumber),
      })
    }
    catch (error) {
      handleKnownError(error, response, next)
    }
  })

  const setMaster = async (
    deviceNumber: string,
    value: 'on' | 'off',
  ) => {
    const definition = await controlRepository.getDefinitionByTopic?.('master')
    if (!definition) throw new Error('未配置 master 自动模式')
    await controls.execute({
      deviceNumber,
      configId: definition.configId,
      value,
    })
    return manager.getSnapshot(deviceNumber)
  }

  router.post('/:deviceNumber/start', async (request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '自动模式已启动，所有运行指令受后端安全保护约束',
        data: await setMaster(request.params.deviceNumber, 'on'),
      })
    }
    catch (error) {
      handleKnownError(error, response, next)
    }
  })

  router.post('/:deviceNumber/stop', async (request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '自动模式正在安全停止',
        data: await setMaster(request.params.deviceNumber, 'off'),
      })
    }
    catch (error) {
      handleKnownError(error, response, next)
    }
  })

  router.post('/:deviceNumber/fault/reset', async (request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '故障已复位，系统保持停止',
        data: await manager.resetFault(request.params.deviceNumber),
      })
    }
    catch (error) {
      handleKnownError(error, response, next)
    }
  })

  router.post('/:deviceNumber/water-flow/reset', async (request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '累计水量已清零',
        data: await waterFlow.reset(request.params.deviceNumber),
      })
    }
    catch (error) {
      handleKnownError(error, response, next)
    }
  })

  router.get('/:deviceNumber/operational-metrics', (request, response) => {
    response.json({
      code: 0,
      message: '操作成功',
      data: operationalMetrics?.getSnapshot(request.params.deviceNumber) ?? null,
    })
  })

  return router
}
