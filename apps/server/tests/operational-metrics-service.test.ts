import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createOperationalMetricsService } from '../src/modules/operational-metrics/runtime.js'

describe('operational metrics service', () => {
  it('restores persisted runtime and saves later increments', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue({
        pumpRuntimeSeconds: 12,
        heaterRuntimeSeconds: 8,
        lastCalculatedAt: 1_000,
        lastPumpState: 'on' as const,
        lastHeaterState: 'on' as const,
      }),
      save: vi.fn(),
      reset: vi.fn(),
    }
    const service = createOperationalMetricsService({
      repository,
      dataTimeoutSeconds: 3,
      persistIntervalMilliseconds: 0,
    })

    expect(await service.getSnapshot('device-1')).toMatchObject({
      pumpRuntimeSeconds: 12,
      heaterRuntimeSeconds: 8,
    })
    await service.handleReading('device-1', {
      recordedAt: 2_500,
      actualPump: 'on',
      actualHeater: 'off',
      outletTemperature: 20,
    })

    expect(repository.save).toHaveBeenCalledWith('device-1', expect.objectContaining({
      pumpRuntimeSeconds: 13.5,
      heaterRuntimeSeconds: 8,
      lastCalculatedAt: 2_500,
    }))
  })

  it('clears both persisted runtime counters', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue({
        pumpRuntimeSeconds: 12,
        heaterRuntimeSeconds: 8,
        lastCalculatedAt: 1_000,
        lastPumpState: 'on' as const,
        lastHeaterState: 'off' as const,
      }),
      save: vi.fn(),
      reset: vi.fn(),
    }
    const service = createOperationalMetricsService({ repository })

    await expect(service.reset('device-1')).resolves.toMatchObject({
      pumpRuntimeSeconds: 0,
      heaterRuntimeSeconds: 0,
    })
    expect(repository.reset).toHaveBeenCalledWith('device-1', 12, 8)
  })

  it('clears the outlet temperature rate when runtime counters are reset', async () => {
    const service = createOperationalMetricsService({ dataTimeoutSeconds: 3 })
    await service.handleReading('device-1', {
      recordedAt: 1_000,
      actualPump: 'on',
      actualHeater: 'on',
      outletTemperature: 20,
    })
    await service.handleReading('device-1', {
      recordedAt: 61_000,
      actualPump: 'on',
      actualHeater: 'on',
      outletTemperature: 23,
    })

    await expect(service.reset('device-1')).resolves.toMatchObject({
      outletHeatingRatePerMinute: null,
    })
  })

  it('keeps the in-memory counters when persistence reset fails', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue({
        pumpRuntimeSeconds: 12,
        heaterRuntimeSeconds: 8,
        lastCalculatedAt: 1_000,
        lastPumpState: 'on' as const,
        lastHeaterState: 'off' as const,
      }),
      save: vi.fn(),
      reset: vi.fn().mockRejectedValue(new Error('database unavailable')),
    }
    const service = createOperationalMetricsService({ repository })

    await expect(service.reset('device-1')).rejects.toThrow('database unavailable')
    await expect(service.getSnapshot('device-1')).resolves.toMatchObject({
      pumpRuntimeSeconds: 12,
      heaterRuntimeSeconds: 8,
    })
  })

  it('accumulates actual pump and heater runtime without counting long gaps', async () => {
    const service = createOperationalMetricsService({ dataTimeoutSeconds: 3 })

    await service.handleReading('device-1', {
      recordedAt: 1_000,
      actualPump: 'on',
      actualHeater: 'off',
      outletTemperature: 20,
    })
    await service.handleReading('device-1', {
      recordedAt: 2_500,
      actualPump: 'on',
      actualHeater: 'on',
      outletTemperature: 20.1,
    })
    await service.handleReading('device-1', {
      recordedAt: 12_500,
      actualPump: 'on',
      actualHeater: 'on',
      outletTemperature: 20.2,
    })

    expect(await service.getSnapshot('device-1')).toMatchObject({
      pumpRuntimeSeconds: 1.5,
      heaterRuntimeSeconds: 1.5,
    })
  })

  it('calculates outlet heating speed in degrees per minute', async () => {
    const service = createOperationalMetricsService({ dataTimeoutSeconds: 3 })

    await service.handleReading('device-1', {
      recordedAt: 1_000,
      actualPump: 'on',
      actualHeater: 'on',
      outletTemperature: 20,
    })
    await service.handleReading('device-1', {
      recordedAt: 61_000,
      actualPump: 'on',
      actualHeater: 'on',
      outletTemperature: 23,
    })

    expect((await service.getSnapshot('device-1')).outletHeatingRatePerMinute).toBe(3)
  })

  it('uses the current configured data timeout', async () => {
    const service = createOperationalMetricsService({
      loadDataTimeoutSeconds: async () => 1,
    })

    await service.handleReading('device-1', {
      recordedAt: 1_000,
      actualPump: 'on',
      actualHeater: 'off',
      outletTemperature: 20,
    })
    await service.handleReading('device-1', {
      recordedAt: 2_500,
      actualPump: 'on',
      actualHeater: 'off',
      outletTemperature: 20.1,
    })

    expect((await service.getSnapshot('device-1')).pumpRuntimeSeconds).toBe(0)
  })
})
