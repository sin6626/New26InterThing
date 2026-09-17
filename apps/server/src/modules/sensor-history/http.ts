/**
 * 阅读导航：历史数据 HTTP 路由：解析时间、设备、分页和趋势参数，查询交给 MySQL 适配器。
 * 入口位置：modules/sensor-history/http.ts
 */

import type { PaginatedSensorHistory } from '@new26interthing/shared'
import { Router, type Response, type Router as ExpressRouter } from 'express'
import { z } from 'zod'

import type { SensorHistoryRepository } from './types.js'

const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
const filters = {
  deviceNumber: z.string().trim().min(1).optional(),
  startTime: dateTime.optional(),
  endTime: dateTime.optional(),
  status: z.enum(['all', 'normal', 'abnormal']).default('all'),
}
const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ...filters,
}).refine((query) => !query.startTime || !query.endTime || query.startTime <= query.endTime)
const trendQuerySchema = z.object({
  limit: z.coerce.number().int().min(10).max(500).default(10),
  ...filters,
}).refine((query) => !query.startTime || !query.endTime || query.startTime <= query.endTime)
const operationalMetricsQuerySchema = z.object({
  deviceNumber: z.string().trim().min(1),
  startTime: dateTime.optional(),
  endTime: dateTime.optional(),
}).refine(
  query => Boolean(query.startTime) === Boolean(query.endTime),
).refine(
  query => !query.startTime || !query.endTime || query.startTime <= query.endTime,
)

/**
 * 生成统一的查询参数错误响应，供 HTTP 路由直接返回。
 * @param response Express 响应对象，用于返回统一 JSON。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const invalidQuery = (response: Response) => {
  response.status(400).json({ code: 400, message: '请求参数错误', data: null })
}

/**
 * 创建传感器历史模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param repository 负责数据库读写的仓储接口。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createSensorHistoryRouter = (repository: SensorHistoryRepository): ExpressRouter => {
  const router = Router()

  router.get('/options', async (_request, response, next) => {
    try {
      response.json({ code: 0, message: '查询成功', data: await repository.getOptions() })
    } catch (error) {
      next(error)
    }
  })

  // 历史数据的图表接口
  router.get('/trend', async (request, response, next) => {
    const parsed = trendQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery(response)
    try {
      response.json({ code: 0, message: '查询成功', data: await repository.getTrend(parsed.data) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/operational-metrics', async (request, response, next) => {
    const parsed = operationalMetricsQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery(response)
    try {
      response.json({
        code: 0,
        message: '查询成功',
        data: await repository.getOperationalMetrics(parsed.data),
      })
    } catch (error) {
      next(error)
    }
  })

  // 差分分页列表
  router.get('/', async (request, response, next) => {
    const parsed = listQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery(response)
    try {
      const result = await repository.list(parsed.data)
      const data: PaginatedSensorHistory = {
        ...result,
        page: parsed.data.page,
        pageSize: parsed.data.pageSize,
      }
      response.json({ code: 0, message: '查询成功', data })
    } catch (error) {
      next(error)
    }
  })

  return router
}
