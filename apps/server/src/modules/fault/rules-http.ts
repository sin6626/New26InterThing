import { Router } from 'express'
import { z } from 'zod'
import type { FaultRuleService } from './rules.js'

const schema = z.object({
  protectionEnabled: z.boolean(),
  recordEnabled: z.boolean(),
  notificationEnabled: z.boolean(),
})

export const createFaultRuleRouter = (service: FaultRuleService) => {
  const router = Router()
  router.get('/', async (_request, response, next) => {
    try {
      response.json({ code: 0, message: '查询成功', data: await service.list() })
    }
    catch (error) {
      next(error)
    }
  })
  router.put('/:faultCode', async (request, response, next) => {
    const parsed = schema.safeParse(request.body)
    if (!parsed.success) {
      return response.status(400).json({ code: 400, message: '请求参数错误', data: null })
    }
    try {
      const rule = await service.update(request.params.faultCode, parsed.data)
      response.json({ code: 0, message: '告警配置已更新', data: rule })
    }
    catch (error) {
      next(error)
    }
  })
  return router
}
