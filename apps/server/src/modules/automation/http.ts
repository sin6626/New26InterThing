/**
 * 阅读导航：自动控制 HTTP 路由：校验页面请求并调用自动控制管理器；页面只发送意图，真正状态转换和安全决策在后端。
 * 入口位置：modules/automation/http.ts
 * 自动模式下的接口
 */

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
import type { OperationHistoryRepository } from '../operation-history/index.js'

export const createAutomationRouter = (
  manager: AutomationManager,
  controls: ControlService,
  controlRepository: ControlRepository,
  waterFlow: WaterFlowService,
  operationalMetrics?: OperationalMetricsService,
  history?: OperationHistoryRepository,
): Router => {
  const router = Router()

  // 查询是否是调试模式
  router.get('/debug-mode', (_request, response) => {
    response.json({ code: 0, message: '操作成功', data: manager.getDebugMode() })
  })

  // 启动/关闭调试模式
  router.post('/debug-mode', (request, response, next) => {
    const oldValue = manager.getDebugMode().enabled ? 'on' : 'off'
    void manager.setDebugMode(request.body?.enabled === true)
      .then(async (data) => {
        await history?.record({
          source: 'application', triggerMode: 'manual',
          commandType: 'debug_mode', commandName: '调试模式',
          oldValue, newValue: data.enabled ? 'on' : 'off',
          result: 'success',
        })
        response.json({ code: 0, message: '调试模式已更新', data })
      })
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
  // 旧项目的遗留接口
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

  // 旧项目的遗留接口
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

  // 故障复位按钮的接口
  router.post('/:deviceNumber/fault/reset', async (request, response, next) => {
    let data: Awaited<ReturnType<AutomationManager['resetFault']>>
    try {
      data = await manager.resetFault(request.params.deviceNumber)
    }
    catch (error) {
      await Promise.resolve(history?.record({
        source: 'application', triggerMode: 'manual',
        commandType: 'fault_reset', deviceNumber: request.params.deviceNumber,
        commandName: '故障复位', result: 'failed',
      })).catch(() => undefined)
      handleKnownError(error, response, next)
      return
    }
    try {
      await history?.record({
        source: 'application', triggerMode: 'manual',
        commandType: 'fault_reset', deviceNumber: request.params.deviceNumber,
        commandName: '故障复位', oldValue: 'fault', newValue: 'stopped',
        result: 'success',
      })
      response.json({ code: 0, message: '故障已复位，系统保持停止', data })
    } catch (error) { next(error) }
  })

  // 累计水量清零的接口
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
