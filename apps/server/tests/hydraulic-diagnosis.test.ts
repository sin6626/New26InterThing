import { describe, expect, it } from 'vitest'

import { createHydraulicDiagnosisService } from '../src/modules/diagnostics/state/confirmation.js'

const config = {
  minSafeFlow: 0.5,
  minOperatingPressure: 20,
  maxSafePressure: 130,
  confirmSeconds: 2,
}

describe('hydraulic diagnosis service', () => {
  it('immediately diagnoses high-pressure low-flow blockage', () => {
    const service = createHydraulicDiagnosisService()
    const result = service.evaluate('device-1', {
      pumpRunning: true,
      buildingFlow: false,
      sensorsValid: true,
      pressure: 130,
      flowRate: 0.4,
    }, config, 1_000)

    expect(result.code).toBe('HYDRAULIC_BLOCKAGE')
  })

  it('confirms low-pressure low-flow pump abnormality after configured time', () => {
    const service = createHydraulicDiagnosisService()
    const facts = {
      pumpRunning: true,
      buildingFlow: false,
      sensorsValid: true,
      pressure: 10,
      flowRate: 0.4,
    }

    expect(service.evaluate('device-1', facts, config, 1_000).code).toBe('HYDRAULIC_NORMAL')
    expect(service.evaluate('device-1', facts, config, 3_000).code).toBe('HYDRAULIC_PUMP_ABNORMAL')
  })

  it('distinguishes normal-pressure low-flow sensor anomaly', () => {
    const service = createHydraulicDiagnosisService()
    const facts = {
      pumpRunning: true,
      buildingFlow: false,
      sensorsValid: true,
      pressure: 30,
      flowRate: 0.4,
    }
    service.evaluate('device-1', facts, config, 1_000)

    expect(service.evaluate('device-1', facts, config, 3_000).code)
      .toBe('HYDRAULIC_SENSOR_ANOMALY')
  })

  it('immediately diagnoses simultaneous pressure and flow collapse', () => {
    const service = createHydraulicDiagnosisService()
    for (const now of [1_000, 2_000, 3_000]) {
      service.evaluate('device-1', {
        pumpRunning: true,
        buildingFlow: false,
        sensorsValid: true,
        pressure: 80,
        flowRate: 2,
      }, config, now)
    }

    const result = service.evaluate('device-1', {
      pumpRunning: true,
      buildingFlow: false,
      sensorsValid: true,
      pressure: 30,
      flowRate: 0.5,
    }, config, 4_000)

    expect(result.code).toBe('HYDRAULIC_LEAK_OR_BURST')
  })
})
