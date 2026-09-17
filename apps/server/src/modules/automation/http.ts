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

/**
 * 创建自动控制模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param manager 管理各设备自动控制引擎的入口模块。
 * @param controls 人工和自动控制共用的指令执行流程。
 * @param controlRepository 指令配置和当前值的仓储接口。
 * @param waterFlow 累计水量和实时流速计算模块。
 * @param operationalMetrics 泵、加热运行时长和温升速率统计模块。
 * @param history 操作历史仓储，用于记录本次动作的来源和结果。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createAutomationRouter = (
  manager: AutomationManager,
  controls: ControlService,
  controlRepository: ControlRepository,
  waterFlow: WaterFlowService,
  operationalMetrics?: OperationalMetricsService,
  history?: OperationHistoryRepository,
): Router => {
  const router = Router()

  // 查询是否是调试模式, 一样内存
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

  /**
   * 把已知业务错误转换为对应 HTTP 状态，未知异常继续交给全局错误处理中间件。
   * @param error 执行过程中捕获的异常。
   * @param response Express 响应对象，用于返回统一 JSON。
   * @param next Express 后续错误处理函数。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  // 指令信息页面的各个状态获取接口, 自动化状态获取的快照, 也是内存的
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

  /**
   * 更新自动控制状态，并返回或广播更新后的结果。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param value 本次准备读取、转换或保存的值。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  // 泵和加热运行时长由后端累计并持久化，温升速度仍使用最近一分钟内存窗口。
  router.get('/:deviceNumber/operational-metrics', async (request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '操作成功',
        data: operationalMetrics
          ? await operationalMetrics.getSnapshot(request.params.deviceNumber)
          : null,
      })
    }
    catch (error) {
      next(error)
    }
  })

  router.post(
    '/:deviceNumber/operational-metrics/reset',
    async (request, response, next) => {
      try {
        await waterFlow.resetRealtimeIndicators(request.params.deviceNumber)
        response.json({
          code: 0,
          message: '实时运行指标已清零',
          data: operationalMetrics
            ? await operationalMetrics.reset(request.params.deviceNumber)
            : null,
        })
      }
      catch (error) {
        next(error)
      }
    },
  )

  return router
}
