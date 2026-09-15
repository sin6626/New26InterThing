import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'
import type { DeviceRepository } from '../src/modules/device/mysql.js'
import type { SensorHistoryRepository } from '../src/modules/sensor-history/types.js'

const servers: Array<{ close: () => void }> = []
const deviceRepository: DeviceRepository = { list: vi.fn() }
const faultRepository = { findMappedMessage: vi.fn(), save: vi.fn(), getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn() }

afterEach(() => servers.splice(0).forEach((server) => server.close()))

const startServer = async (sensorHistoryRepository: SensorHistoryRepository) => {
  const server = createApp({ deviceRepository, faultRepository, sensorHistoryRepository }).listen(0)
  servers.push(server)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return `http://127.0.0.1:${address.port}`
}

describe('sensor history HTTP API', () => {
  it('returns options and trend using the common response envelope', async () => {
    const repository = {
      getOptions: vi.fn().mockResolvedValue({ deviceNumbers: ['202111'], fields: [] }),
      list: vi.fn(),
      getTrend: vi.fn().mockResolvedValue({ times: [], series: [] }),
    }
    const baseUrl = await startServer(repository)

    const optionsResponse = await fetch(`${baseUrl}/api/sensor-history/options`)
    const trendResponse = await fetch(`${baseUrl}/api/sensor-history/trend?limit=10`)

    expect(await optionsResponse.json()).toEqual({
      code: 0,
      message: '查询成功',
      data: { deviceNumbers: ['202111'], fields: [] },
    })
    expect(await trendResponse.json()).toEqual({
      code: 0,
      message: '查询成功',
      data: { times: [], series: [] },
    })
  })

  it('returns a filtered history page through the public API', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], total: 0 })
    const repository = { getOptions: vi.fn(), list, getTrend: vi.fn() }
    const baseUrl = await startServer(repository)

    const response = await fetch(`${baseUrl}/api/sensor-history?page=2&pageSize=10&deviceNumber=202111&status=abnormal&startTime=2026-09-10%2008%3A00%3A00&endTime=2026-09-10%2010%3A00%3A00`)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      code: 0,
      message: '查询成功',
      data: { items: [], total: 0, page: 2, pageSize: 10 },
    })
    expect(list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      deviceNumber: '202111',
      status: 'abnormal',
      startTime: '2026-09-10 08:00:00',
      endTime: '2026-09-10 10:00:00',
    })
  })

  it('rejects an inverted time range before querying the repository', async () => {
    const list = vi.fn()
    const repository = { getOptions: vi.fn(), list, getTrend: vi.fn() }
    const baseUrl = await startServer(repository)

    const response = await fetch(`${baseUrl}/api/sensor-history?startTime=2026-09-10%2011%3A00%3A00&endTime=2026-09-10%2010%3A00%3A00`)

    expect(response.status).toBe(400)
    expect(list).not.toHaveBeenCalled()
  })

  it('limits trend points to the accepted range', async () => {
    const getTrend = vi.fn()
    const repository = { getOptions: vi.fn(), list: vi.fn(), getTrend }
    const baseUrl = await startServer(repository)

    const response = await fetch(`${baseUrl}/api/sensor-history/trend?limit=501`)

    expect(response.status).toBe(400)
    expect(getTrend).not.toHaveBeenCalled()
  })

  it('returns HTTP 500 when the repository fails', async () => {
    const repository = {
      getOptions: vi.fn(),
      list: vi.fn().mockRejectedValue(new Error('database unavailable')),
      getTrend: vi.fn(),
    }
    const baseUrl = await startServer(repository)

    const response = await fetch(`${baseUrl}/api/sensor-history`)

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ code: 500, message: '服务器内部错误', data: null })
  })
})
