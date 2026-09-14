import {
  describe,
  expect,
  it,
} from 'vitest'

import { createOperationalMetricsService } from '../src/modules/operational-metrics/operational-metrics.service.js'

describe('operational metrics service', () => {
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

    expect(service.getSnapshot('device-1')).toMatchObject({
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

    expect(service.getSnapshot('device-1').outletHeatingRatePerMinute).toBe(3)
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

    expect(service.getSnapshot('device-1').pumpRuntimeSeconds).toBe(0)
  })
})
