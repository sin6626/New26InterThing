import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import express from 'express'

import { createAutomationRouter } from '../src/modules/automation/automation.routes.js'
import { AutomationError } from '../src/modules/automation/automation.types.js'
import type { AutomationManager } from '../src/modules/automation/automation-manager.js'
import type { ControlRepository } from '../src/modules/control/control.repository.js'
import {
  ControlError,
  type ControlService,
} from '../src/modules/control/control.service.js'
import type { WaterFlowService } from '../src/modules/water-flow/water-flow.service.js'
import type { OperationalMetricsService } from '../src/modules/operational-metrics/operational-metrics.service.js'

const servers: Array<{ close(): void }> = []

afterEach(() => servers.splice(0).forEach(server => server.close()))

const startServer = async (
  resetFault: ReturnType<typeof vi.fn>,
  controls = {} as ControlService,
  controlRepository = {} as ControlRepository,
  operationalMetrics = undefined as OperationalMetricsService | undefined,
) => {
  const app = express()
  app.use('/api/automation', createAutomationRouter(
    { resetFault } as unknown as AutomationManager,
    controls,
    controlRepository,
    {} as WaterFlowService,
    operationalMetrics,
  ))
  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    response.status(500).json({ message: error instanceof Error ? error.message : String(error) })
  })
  const server = app.listen(0)
  servers.push(server)
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return `http://127.0.0.1:${address.port}`
}

describe('automation HTTP API', () => {
  it('returns the current operational metrics for initial page loading', async () => {
    const getSnapshot = vi.fn().mockReturnValue({
      deviceNumber: 'device-1',
      pumpRuntimeSeconds: 12,
      heaterRuntimeSeconds: 8,
      outletHeatingRatePerMinute: 1.5,
    })
    const baseUrl = await startServer(
      vi.fn(),
      {} as ControlService,
      {} as ControlRepository,
      { getSnapshot } as unknown as OperationalMetricsService,
    )

    const response = await fetch(
      `${baseUrl}/api/automation/device-1/operational-metrics`,
    )

    expect(response.status).toBe(200)
    expect(getSnapshot).toHaveBeenCalledWith('device-1')
    expect(await response.json()).toMatchObject({
      code: 0,
      data: {
        pumpRuntimeSeconds: 12,
        heaterRuntimeSeconds: 8,
        outletHeatingRatePerMinute: 1.5,
      },
    })
  })

  it('returns a visible 409 when fault reset conditions are not met', async () => {
    const baseUrl = await startServer(vi.fn().mockRejectedValue(
      new AutomationError('水泵和加热尚未全部关闭'),
    ))

    const response = await fetch(`${baseUrl}/api/automation/device-1/fault/reset`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({
      code: 409,
      message: '水泵和加热尚未全部关闭',
      data: null,
    })
  })

  it('returns the stopped snapshot after a successful reset', async () => {
    const resetFault = vi.fn().mockResolvedValue({ state: 'stopped' })
    const baseUrl = await startServer(resetFault)

    const response = await fetch(`${baseUrl}/api/automation/device-1/fault/reset`, {
      method: 'POST',
    })

    expect(response.status).toBe(200)
    expect(resetFault).toHaveBeenCalledWith('device-1')
    expect(await response.json()).toMatchObject({
      code: 0,
      data: { state: 'stopped' },
    })
  })

  it('returns a visible 409 when automatic start is rejected', async () => {
    const controls = {
      execute: vi.fn().mockRejectedValue(
        new ControlError('最近传感器数据不可用，无法启动自动模式', 409),
      ),
    } as unknown as ControlService
    const controlRepository = {
      getDefinitionByTopic: vi.fn().mockResolvedValue({ configId: 1 }),
    } as unknown as ControlRepository
    const baseUrl = await startServer(
      vi.fn(),
      controls,
      controlRepository,
    )

    const response = await fetch(`${baseUrl}/api/automation/device-1/start`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 409,
      message: '最近传感器数据不可用，无法启动自动模式',
    })
  })

  it('returns a visible 409 when automatic stop is rejected', async () => {
    const controls = {
      execute: vi.fn().mockRejectedValue(
        new ControlError('关热指令发布失败', 409),
      ),
    } as unknown as ControlService
    const controlRepository = {
      getDefinitionByTopic: vi.fn().mockResolvedValue({ configId: 1 }),
    } as unknown as ControlRepository
    const baseUrl = await startServer(
      vi.fn(),
      controls,
      controlRepository,
    )

    const response = await fetch(`${baseUrl}/api/automation/device-1/stop`, {
      method: 'POST',
    })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({
      code: 409,
      message: '关热指令发布失败',
    })
  })
})
