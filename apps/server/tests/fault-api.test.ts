import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import type { FaultRepository } from '../src/modules/fault/ports.js'

const servers: Array<{ close: () => void }> = []
const deviceRepository = { list: vi.fn() }
const sensorHistoryRepository = { getOptions: vi.fn(), list: vi.fn(), getTrend: vi.fn(), getOperationalMetrics: vi.fn() }

afterEach(() => servers.splice(0).forEach((server) => server.close()))

const startServer = async (faultRepository: FaultRepository) => {
  const server = createApp({ deviceRepository, faultRepository, sensorHistoryRepository }).listen(0)
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return `http://127.0.0.1:${address.port}`
}

const repository = (overrides: Partial<FaultRepository> = {}): FaultRepository => ({
  findMappedMessage: vi.fn(), save: vi.fn(), getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(), ...overrides,
})

describe('fault HTTP API', () => {
  it('returns options, a filtered page, and statistics in the common envelope', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const getStatistics = vi.fn().mockResolvedValue([{ type: '3', label: '类型 3', count: 2 }])
    const baseUrl = await startServer(repository({
      getOptions: vi.fn().mockResolvedValue({ deviceNumbers: ['202111'], types: [{ value: '3', label: '类型 3' }] }),
      list,
      getStatistics,
    }))

    const optionsResponse = await fetch(`${baseUrl}/api/faults/options`)
    const pageResponse = await fetch(`${baseUrl}/api/faults?page=2&pageSize=10&deviceNumber=202111&type=3`)
    const statisticsResponse = await fetch(`${baseUrl}/api/faults/statistics?deviceNumber=202111&type=3`)

    expect(await optionsResponse.json()).toEqual({
      code: 0,
      message: '查询成功',
      data: { deviceNumbers: ['202111'], types: [{ value: '3', label: '类型 3' }] },
    })
    expect(await pageResponse.json()).toEqual({ code: 0, message: '查询成功', data: { items: [], total: 0, page: 2, pageSize: 10 } })
    expect(await statisticsResponse.json()).toEqual({
      code: 0,
      message: '查询成功',
      data: [{ type: '3', label: '类型 3', count: 2 }],
    })
    expect(list).toHaveBeenCalledWith({ page: 2, pageSize: 10, deviceNumber: '202111', type: '3' })
    expect(getStatistics).toHaveBeenCalledWith({ deviceNumber: '202111', type: '3' })
  })

  it('rejects invalid ranges and returns 500 for repository failures', async () => {
    const list = vi.fn().mockRejectedValue(new Error('database unavailable'))
    const baseUrl = await startServer(repository({ list }))
    const invalid = await fetch(`${baseUrl}/api/faults?startTime=2026-09-11%2011%3A00%3A00&endTime=2026-09-11%2010%3A00%3A00`)
    const failed = await fetch(`${baseUrl}/api/faults`)

    expect(invalid.status).toBe(400)
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ code: 500, message: '服务器内部错误', data: null })
  })

  it('rejects calendar-invalid dates before querying the repository', async () => {
    const list = vi.fn()
    const baseUrl = await startServer(repository({ list }))
    const response = await fetch(`${baseUrl}/api/faults?startTime=2026-99-99%2088%3A00%3A00`)
    expect(response.status).toBe(400)
    expect(list).not.toHaveBeenCalled()
  })

  it.each(['getOptions', 'getStatistics'] as const)('returns 500 when %s fails', async (method) => {
    const failing = vi.fn().mockRejectedValue(new Error('database unavailable'))
    const baseUrl = await startServer(repository({ [method]: failing }))
    const path = method === 'getOptions' ? '/api/faults/options' : '/api/faults/statistics'
    const response = await fetch(`${baseUrl}${path}`)
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: 500, message: '服务器内部错误', data: null })
  })
})
