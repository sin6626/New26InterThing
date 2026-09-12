import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createApp } from '../src/app.js'
import type { ControlRepository } from '../src/modules/control/control.repository.js'
import type { ControlService } from '../src/modules/control/control.service.js'

const servers: Array<{ close(): void }> = []

afterEach(() => {
  servers.splice(0).forEach(server => server.close())
})

const createRepository = (): ControlRepository => ({
  getSnapshot: vi.fn().mockResolvedValue({
    deviceNumber: 'e46488d793245429',
    fields: [],
  }),
  getDefinition: vi.fn(),
  saveSuccess: vi.fn(),
  saveFailure: vi.fn(),
  applyDeviceReport: vi.fn(),
  saveTimeSync: vi.fn(),
  getLogOptions: vi.fn().mockResolvedValue({
    deviceNumbers: ['e46488d793245429'],
    commandTypes: ['pump'],
    results: ['success'],
  }),
  listLogs: vi.fn().mockResolvedValue({
    items: [],
    total: 0,
  }),
})

const startServer = async () => {
  const controlRepository = createRepository()
  const controlService = {
    execute: vi.fn().mockResolvedValue({
      configId: 23,
      value: 'on',
      status: 'published',
    }),
    syncTime: vi.fn(),
  } as unknown as ControlService
  const app = createApp({
    deviceRepository: { list: vi.fn() },
    faultRepository: {
      findMappedMessage: vi.fn(),
      save: vi.fn(),
      getOptions: vi.fn(),
      list: vi.fn(),
      getStatistics: vi.fn(),
    },
    sensorHistoryRepository: {
      getOptions: vi.fn(),
      list: vi.fn(),
      getTrend: vi.fn(),
    },
    controlRepository,
    controlService,
  })
  const server = app.listen(0)
  servers.push(server)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('测试服务启动失败')
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    controlRepository,
    controlService,
  }
}

describe('control HTTP API', () => {
  it('returns the single-device snapshot and executes a command', async () => {
    const {
      baseUrl,
      controlRepository,
      controlService,
    } = await startServer()

    const snapshot = await fetch(`${baseUrl}/api/controls/e46488d793245429`)
    const command = await fetch(`${baseUrl}/api/controls/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceNumber: 'e46488d793245429',
        configId: 23,
        value: true,
      }),
    })

    expect(snapshot.status).toBe(200)
    expect(controlRepository.getSnapshot)
      .toHaveBeenCalledWith('e46488d793245429')
    expect(command.status).toBe(200)
    expect(controlService.execute).toHaveBeenCalledWith({
      deviceNumber: 'e46488d793245429',
      configId: 23,
      value: true,
    })
  })

  it('rejects malformed commands before calling the service', async () => {
    const { baseUrl, controlService } = await startServer()
    const response = await fetch(`${baseUrl}/api/controls/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceNumber: '', configId: 0 }),
    })

    expect(response.status).toBe(400)
    expect(controlService.execute).not.toHaveBeenCalled()
  })

  it('returns filtered operation logs in the common envelope', async () => {
    const { baseUrl, controlRepository } = await startServer()
    const response = await fetch(
      `${baseUrl}/api/operation-logs?page=2&pageSize=10&result=success`,
    )

    expect(response.status).toBe(200)
    expect(controlRepository.listLogs).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      result: 'success',
    })
    expect(await response.json()).toEqual({
      code: 0,
      message: '查询成功',
      data: {
        items: [],
        total: 0,
        page: 2,
        pageSize: 10,
      },
    })
  })

  it('rejects calendar-invalid operation log dates', async () => {
    const { baseUrl, controlRepository } = await startServer()
    const response = await fetch(
      `${baseUrl}/api/operation-logs?startTime=2026-99-99%2088%3A00%3A00`,
    )

    expect(response.status).toBe(400)
    expect(controlRepository.listLogs).not.toHaveBeenCalled()
  })
})
