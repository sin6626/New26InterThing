import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createWaterFlowService } from '../src/modules/water-flow/accumulate.js'

describe('water flow service', () => {
  it('integrates adjacent valid flow samples and ignores long gaps', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue(null),
      save: vi.fn(),
      reset: vi.fn(),
    }
    const service = createWaterFlowService({
      repository,
      loadPipeDiameter: vi.fn().mockResolvedValue(20),
      dataTimeoutSeconds: 3,
    })

    await service.handleReading('device-1', 6, 1_000)
    const second = await service.handleReading('device-1', 6, 11_000)
    const third = await service.handleReading('device-1', 6, 13_000)

    expect(second.totalVolumeLiters).toBe(0)
    expect(third.totalVolumeLiters).toBeCloseTo(0.2)
    expect(third.flowVelocityMetersPerSecond).toBeCloseTo(0.318, 3)
  })

  it('restores and resets the persisted accumulator through its public interface', async () => {
    const repository = {
      load: vi.fn().mockResolvedValue({
        totalVolumeLiters: 12.5,
        lastFlowRateLitersPerMinute: 3,
        lastCalculatedAt: 1_000,
      }),
      save: vi.fn(),
      reset: vi.fn(),
    }
    const service = createWaterFlowService({
      repository,
      loadPipeDiameter: vi.fn().mockResolvedValue(null),
    })

    expect((await service.getSnapshot('device-1')).totalVolumeLiters).toBe(12.5)
    const reset = await service.reset('device-1')

    expect(reset.totalVolumeLiters).toBe(0)
    expect(repository.reset).toHaveBeenCalledWith('device-1', 12.5)
  })
})
