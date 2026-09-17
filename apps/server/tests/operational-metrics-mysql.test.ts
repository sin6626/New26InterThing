import { describe, expect, it, vi } from 'vitest'

import { createOperationalMetricsRepository } from '../src/modules/operational-metrics/mysql.js'

describe('operational metrics MySQL repository', () => {
  it('loads and saves the persisted runtime state', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[
        {
          pump_runtime_seconds: 12.5,
          heater_runtime_seconds: 8,
          last_calc_time: 2_500,
          last_pump_state: 'on',
          last_heater_state: 'off',
        },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const repository = createOperationalMetricsRepository(
      { query } as never,
      { record: vi.fn() } as never,
    )

    await expect(repository.load('device-1')).resolves.toEqual({
      pumpRuntimeSeconds: 12.5,
      heaterRuntimeSeconds: 8,
      lastCalculatedAt: 2_500,
      lastPumpState: 'on',
      lastHeaterState: 'off',
    })
    await repository.save('device-1', {
      pumpRuntimeSeconds: 13,
      heaterRuntimeSeconds: 8,
      lastCalculatedAt: 3_000,
      lastPumpState: 'on',
      lastHeaterState: 'off',
    })

    expect(query.mock.calls[1][1]).toEqual([
      'device-1', 13, 8, 3_000, 'on', 'off',
    ])
  })

  it('resets both counters and records the manual operation in one transaction', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      query: vi.fn().mockResolvedValue([{ affectedRows: 1 }]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    }
    const history = { record: vi.fn() }
    const repository = createOperationalMetricsRepository(
      { getConnection: vi.fn().mockResolvedValue(connection) } as never,
      history as never,
    )

    await repository.reset('device-1', 12.5, 8)

    expect(history.record).toHaveBeenCalledWith(expect.objectContaining({
      source: 'application',
      commandType: 'reset_operational_runtime',
      deviceNumber: 'device-1',
      result: 'success',
    }), connection)
    expect(connection.commit).toHaveBeenCalledOnce()
    expect(connection.release).toHaveBeenCalledOnce()
  })
})
