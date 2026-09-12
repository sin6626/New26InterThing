import { Router } from 'express'

import type { ControlRepository } from '../control/control.repository.js'
import type { ControlService } from '../control/control.service.js'
import type { WaterFlowService } from '../water-flow/water-flow.service.js'
import type { AutomationManager } from './automation-manager.js'

export const createAutomationRouter = (
  manager: AutomationManager,
  controls: ControlService,
  controlRepository: ControlRepository,
  waterFlow: WaterFlowService,
) => {
  const router = Router()

  router.get('/:deviceNumber', async (request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '操作成功',
        data: await manager.getSnapshot(request.params.deviceNumber),
      })
    }
    catch (error) {
      next(error)
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
        message: '自动模式已启动；安全保护完成前不会真正开启加热',
        data: await setMaster(request.params.deviceNumber, 'on'),
      })
    }
    catch (error) {
      next(error)
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
      next(error)
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
      next(error)
    }
  })

  return router
}
