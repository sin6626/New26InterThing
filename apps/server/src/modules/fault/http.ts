/**
 * 阅读导航：故障信息 HTTP 路由：验证时间、设备、故障类型和分页条件；页面故障列表只用 HTTP 查询。
 * 错误信息页面的接口路由
 * 入口位置：modules/fault/http.ts
 */

import type { PaginatedFaults } from '@new26interthing/shared'
import { Router, type Response, type Router as ExpressRouter } from 'express'
import { z } from 'zod'

import type { FaultRepository } from './ports.js'

const isValidDateTime = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
  if (!match) return false
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const date = new Date(year, month - 1, day, hour, minute, second)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    && date.getHours() === hour && date.getMinutes() === minute && date.getSeconds() === second
}
const dateTime = z.string().refine(isValidDateTime)
const filters = {
  deviceNumber: z.string().trim().min(1).optional(),
  type: z.string().trim().min(1).optional(),
  startTime: dateTime.optional(),
  endTime: dateTime.optional(),
}
const filterSchema = z.object(filters)
  .refine((query) => !query.startTime || !query.endTime || query.startTime <= query.endTime)
const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  ...filters,
}).refine((query) => !query.startTime || !query.endTime || query.startTime <= query.endTime)

const invalidQuery = (response: Response) => {
  response.status(400).json({ code: 400, message: '请求参数错误', data: null })
}

export const createFaultRouter = (repository: FaultRepository): ExpressRouter => {
  const router = Router()

  // 错误信息页面的所有下拉框的接口, 设备下拉框和错误类型下拉框都是这个接口, 一个接口返回两个下拉框所需的值
  router.get('/options', async (_request, response, next) => {
    try {
      response.json({ code: 0, message: '查询成功', data: await repository.getOptions() })
    } catch (error) {
      next(error)
    }
  })

  // 错误信息页面的图表的数据, 方便饼图渲染的格式
  router.get('/statistics', async (request, response, next) => {
    const parsed = filterSchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery(response)
    try {
      response.json({ code: 0, message: '查询成功', data: await repository.getStatistics(parsed.data) })
    } catch (error) {
      next(error)
    }
  })

  // 错误信息页面上多条件分页查询的接口
  router.get('/', async (request, response, next) => {
    const parsed = listSchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery(response)
    try {
      const result = await repository.list(parsed.data)
      const data: PaginatedFaults = { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize }
      response.json({ code: 0, message: '查询成功', data })
    } catch (error) {
      next(error)
    }
  })

  return router
}
