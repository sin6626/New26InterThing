import { describe, expect, it } from 'vitest'

import { calculateHistoricalOperationalMetrics } from '../src/modules/sensor-history/operational-metrics.js'

describe('historical operational metrics', () => {
  it('estimates actuator runtime from actual feedback without counting long gaps', () => {
    const result = calculateHistoricalOperationalMetrics({
      deviceNumber: '202111',
      dataTimeoutSeconds: 3,
      samples: [
        { recordedAt: 1_000, actualPump: 'on', actualHeater: 'off', outletTemperature: 20 },
        { recordedAt: 2_500, actualPump: 'on', actualHeater: 'on', outletTemperature: 20.1 },
        { recordedAt: 4_000, actualPump: 'off', actualHeater: 'on', outletTemperature: 20.2 },
        { recordedAt: 14_000, actualPump: 'on', actualHeater: 'on', outletTemperature: 20.3 },
      ],
    })

    expect(result.pumpRuntimeSeconds).toBe(1.5)
    expect(result.heaterRuntimeSeconds).toBe(3)
  })

  it('returns the last rolling outlet-temperature rate in each minute', () => {
    const result = calculateHistoricalOperationalMetrics({
      deviceNumber: '202111',
      dataTimeoutSeconds: 3,
      samples: [
        { recordedAt: Date.parse('2026-09-17T02:00:00.000Z'), actualPump: 'off', actualHeater: 'off', outletTemperature: 20 },
        { recordedAt: Date.parse('2026-09-17T02:00:30.000Z'), actualPump: 'off', actualHeater: 'off', outletTemperature: 21 },
        { recordedAt: Date.parse('2026-09-17T02:01:00.000Z'), actualPump: 'off', actualHeater: 'off', outletTemperature: 23 },
        { recordedAt: Date.parse('2026-09-17T02:01:30.000Z'), actualPump: 'off', actualHeater: 'off', outletTemperature: 22 },
      ],
    })

    expect(result.outletTemperatureRate).toEqual({
      times: ['2026-09-17 10:00:00', '2026-09-17 10:01:00'],
      data: [2, 1],
    })
  })

  it('clips the first interval to the requested start time', () => {
    const result = calculateHistoricalOperationalMetrics({
      deviceNumber: '202111',
      dataTimeoutSeconds: 20,
      startTime: 5_000,
      endTime: 12_000,
      samples: [
        { recordedAt: 1_000, actualPump: 'on', actualHeater: 'on', outletTemperature: 20 },
        { recordedAt: 11_000, actualPump: 'on', actualHeater: 'on', outletTemperature: 21 },
      ],
    })

    expect(result.pumpRuntimeSeconds).toBe(6)
    expect(result.heaterRuntimeSeconds).toBe(6)
  })
})
