import type { PaginatedDevices } from '@new26interthing/shared'
import { Router, type Router as ExpressRouter } from 'express'
import { z } from 'zod'

import type { DeviceRepository } from './device.repository.js'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  number: z.string().trim().min(1).optional(),
  deviceName: z.string().trim().min(1).optional(),
})

export const createDeviceRouter = (repository: DeviceRepository): ExpressRouter => {
  const router = Router()

  router.get('/', async (request, response, next) => {
    // 在做表单的或者接口传递参数校验的时候, 一般使用safeParse, 因为safeParse不会直接抛出异常, 而是一个状态对象, 或许可以根据状态写代码
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) {
      response.status(400).json({ code: 400, message: '请求参数错误', data: null })
      return
    }

    try {
      const result = await repository.list(parsed.data)
      const data: PaginatedDevices = {
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
