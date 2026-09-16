/**
 * 阅读导航：指令与操作日志路由：校验请求格式、调用控制流程并返回明确状态码；这里只接收人工意图，不自行发 MQTT。
 * 入口位置：modules/control/http.ts
 */

import type { PaginatedOperationLogs } from '@new26interthing/shared'
import {
  Router,
  type Response,
  type Router as ExpressRouter,
} from 'express'
import { z } from 'zod'

import type { ControlRepository } from './types.js'
import type { OperationHistoryRepository } from '../operation-history/index.js'
import {
  ControlError,
  type ControlService,
} from './flows/execute.js'

const commandSchema = z.object({
  deviceNumber: z.string().trim().min(1),
  configId: z.number().int(),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
})
const timeSyncSchema = z.object({
  deviceNumber: z.string().trim().min(1),
  time: z.string().trim().min(1).optional(),
})
const isValidDateTime = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return false
  }
  const date = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(date.getTime())) return false
  const pad = (part: number) => String(part).padStart(2, '0')
  const normalized = [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
  return normalized === value
}
// refine zod中的自定义校验规则
const dateTime = z.string().refine(isValidDateTime)
const logSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  deviceNumber: z.string().trim().min(1).optional(),
  source: z.enum(['application', 'device', 'recognition']).optional(),
  commandType: z.string().trim().min(1).optional(),
  result: z.string().trim().min(1).optional(),
  startTime: dateTime.optional(),
  endTime: dateTime.optional(),
}).refine(
  query => !query.startTime
    || !query.endTime
    || query.startTime <= query.endTime,
)

const invalid = (response: Response) => response.status(400).json({
  code: 400,
  message: '请求参数错误',
  data: null,
})

export const createControlRouter = (
  repository: ControlRepository,
  service: ControlService,
): ExpressRouter => {
  const router = Router()

  // 校验时间的接口, 但是没有用了, 因为设备端他们能自己校准时间
  router.post('/time-sync', async (request, response, next) => {
    const parsed = timeSyncSchema.safeParse(request.body)
    if (!parsed.success) return invalid(response)
    try {
      response.json({
        code: 0,
        message: '时间同步已发布',
        data: await service.syncTime(parsed.data.deviceNumber, parsed.data.time),
      })
    }
    catch (error) {
      if (error instanceof ControlError) {
        return response.status(error.status).json({
          code: error.status,
          message: error.message,
          data: null,
        })
      }
      next(error)
    }
  })
  
  // 指令信息页面打开就调用的接口, tree组件直接渲染各个配置项和指令的状态
  router.get('/:deviceNumber', async (request, response, next) => {
    const deviceNumber = String(request.params.deviceNumber || '').trim()
    if (!deviceNumber) return invalid(response)
    try {
      response.json({
        code: 0,
        message: '查询成功',
        data: await repository.getSnapshot(deviceNumber),
      })
    }
    catch (error) {
      next(error)
    }
  })

  // 修改配置项或者下发指令的接口
  router.post('/commands', async (request, response, next) => {
    const parsed = commandSchema.safeParse(request.body)
    if (!parsed.success) return invalid(response)
    try {
      response.json({
        code: 0,
        message: '指令处理成功',
        data: await service.execute(parsed.data),
      })
    }
    catch (error) {
      if (error instanceof ControlError) {
        return response.status(error.status).json({
          code: error.status,
          message: error.message,
          data: null,
        })
      }
      next(error)
    }
  })

  return router
}

// 操作日志相关的接口
export const createOperationLogRouter = (
  repository: OperationHistoryRepository,
): ExpressRouter => {
  const router = Router()
  // 操作历史页面的下拉框
  router.get('/options', async (_request, response, next) => {
    try {
      response.json({
        code: 0,
        message: '查询成功',
        data: await repository.getLogOptions(),
      })
    }
    catch (error) {
      next(error)
    }
  })
  //分页查询列表
  router.get('/', async (request, response, next) => {
    const parsed = logSchema.safeParse(request.query)
    if (!parsed.success) return invalid(response)
    try {
      const result = await repository.listLogs(parsed.data)
      const data: PaginatedOperationLogs = {
        ...result,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      }
      response.json({ code: 0, message: '查询成功', data })
    }
    catch (error) {
      next(error)
    }
  })
  return router
}
