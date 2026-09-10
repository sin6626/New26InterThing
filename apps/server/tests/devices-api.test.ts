import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DeviceRepository } from '../src/modules/device/device.repository.js'
import { createApp } from '../src/app.js'

const servers: Array<{ close: () => void }> = []

afterEach(() => {
  servers.splice(0).forEach((server) => server.close())
})

describe('GET /api/devices', () => {
  it('allows cross-origin requests from any origin', async () => {
    const repository: DeviceRepository = { list: vi.fn() }
    const server = createApp({ deviceRepository: repository }).listen(0)
    servers.push(server)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('测试服务启动失败')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/devices`, {
      headers: { Origin: 'https://example.com' },
    })

    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })

  it('returns a filtered page of devices through the public HTTP API', async () => {
    const repository: DeviceRepository = {
      list: vi.fn().mockResolvedValue({
        items: [
          {
            id: 19,
            number: '202111',
            deviceName: '水循环设备',
            remarks: '比赛设备',
            createdAt: '2026-09-10 18:30:00',
          },
        ],
        total: 1,
      }),
    }
    const server = createApp({ deviceRepository: repository }).listen(0)
    servers.push(server)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('测试服务启动失败')

    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/devices?page=2&pageSize=10&number=202&deviceName=%E6%B0%B4`,
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      code: 0,
      message: '查询成功',
      data: {
        items: [
          {
            id: 19,
            number: '202111',
            deviceName: '水循环设备',
            remarks: '比赛设备',
            createdAt: '2026-09-10 18:30:00',
          },
        ],
        total: 1,
        page: 2,
        pageSize: 10,
      },
    })
    expect(repository.list).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      number: '202',
      deviceName: '水',
    })
  })

  it('rejects invalid pagination without calling the database', async () => {
    const repository: DeviceRepository = { list: vi.fn() }
    const server = createApp({ deviceRepository: repository }).listen(0)
    servers.push(server)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('测试服务启动失败')

    const response = await fetch(`http://127.0.0.1:${address.port}/api/devices?page=0`)

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      code: 400,
      message: '请求参数错误',
      data: null,
    })
    expect(repository.list).not.toHaveBeenCalled()
  })
})
