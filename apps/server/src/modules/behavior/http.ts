/**
 * 阅读导航：行为 HTTP 路由：查询字段和结果，接收选中的历史记录 ID 发起识别；参数错误在进入识别流程前拒绝。
 * 入口位置：modules/behavior/http.ts
 */

import type { PaginatedBehaviors } from '@new26interthing/shared'
import { Router, type Response, type Router as ExpressRouter } from 'express'
import { z } from 'zod'

import type { BehaviorRepository } from './types.js'
import type { RecognitionService } from './flows/recognize.js'

const dateTime = z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
const querySchema = z.object({ page: z.coerce.number().int().min(1).default(1), pageSize: z.coerce.number().int().min(1).max(100).default(20), startTime: dateTime.optional(), endTime: dateTime.optional() }).refine(query => !query.startTime || !query.endTime || query.startTime <= query.endTime)
const recognitionSchema = z.object({ rowIds: z.array(z.number().int().positive()).min(1).max(500).refine(ids => new Set(ids).size === ids.length) })
const invalid = (response: Response) => response.status(400).json({ code: 400, message: '请求参数错误', data: null })

export const createBehaviorRouter = (repository: BehaviorRepository, recognitionService: RecognitionService): ExpressRouter => {
  const router = Router()
  router.get('/options', async (_request, response, next) => { try { response.json({ code: 0, message: '查询成功', data: await repository.getOptions() }) } catch (error) { next(error) } })
  router.get('/', async (request, response, next) => {
    const parsed = querySchema.safeParse(request.query); if (!parsed.success) return invalid(response)
    try { const result = await repository.list(parsed.data); const data: PaginatedBehaviors = { ...result, page: parsed.data.page, pageSize: parsed.data.pageSize }; response.json({ code: 0, message: '查询成功', data }) } catch (error) { next(error) }
  })
  router.post('/recognize', async (request, response, next) => {
    const parsed = recognitionSchema.safeParse(request.body); if (!parsed.success) return invalid(response)
    try { response.json({ code: 0, message: '识别成功', data: await recognitionService.recognize(parsed.data.rowIds) }) } catch (error) {
      response.status(422).json({ code: 422, message: error instanceof Error ? error.message : '智能识别失败', data: null })
    }
  })
  return router
}
