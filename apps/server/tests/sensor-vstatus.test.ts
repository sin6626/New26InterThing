import { describe, expect, it, vi } from 'vitest'

import { createSensorVstatusEvaluator } from '../src/modules/realtime/sensor-vstatus.js'
import type { AutomationConfig } from '../src/modules/automation/automation.types.js'

const config: AutomationConfig = {
  strategy: 'pid',
  targetTemperature: 40,
  temperatureHysteresis: 1,
  minSafeFlow: 3,
  buildFlowTimeoutSeconds: 5,
  coolingDelaySeconds: 5,
  dataTimeoutSeconds: 3,
  lowFlowConfirmSeconds: 2,
  maxSafePressure: 25,
  maxSafeTemperature: 45,
  temperatureReversedConfirmSeconds: 5,
  dryHeatingTimeoutSeconds: 60,
  dryHeatingTemperatureDifference: 0.1,
  pid: {
    targetTemperature: 40,
    kp: 1,
    ki: 0,
    kd: 0,
    cycleSeconds: 10,
    minOnSeconds: 2,
    minOffSeconds: 2,
    overshootAllowance: 1,
    resumeHysteresis: 1,
  },
}

const message = (values: Record<string, string | number | null>) => ({
  deviceNumber: 'device-1',
  recordedAt: '2026-09-14 18:00:00',
  dataKind: 'realtime' as const,
  values,
})

describe('sensor history status evaluation', () => {
  it('marks configured temperature and pressure boundaries as alarms', async () => {
    const evaluate = createSensorVstatusEvaluator(vi.fn().mockResolvedValue(config))

    await expect(evaluate(message({ temp_out: 45, water_Y2: 0 }))).resolves.toBe(1)
    await expect(evaluate(message({ pressure: 25, water_Y2: 0 }))).resolves.toBe(1)
  })

  it('marks low flow only while the device reports the pump running', async () => {
    const evaluate = createSensorVstatusEvaluator(vi.fn().mockResolvedValue(config))

    await expect(evaluate(message({ flow_rate: 2.9, water_Y2: 1 }))).resolves.toBe(1)
    await expect(evaluate(message({ flow_rate: 0, water_Y2: 0 }))).resolves.toBe(0)
  })

  it('keeps current normal operating data normal', async () => {
    const evaluate = createSensorVstatusEvaluator(vi.fn().mockResolvedValue(config))

    await expect(evaluate(message({
      temp_in: 29.5,
      temp_out: 30,
      pressure: 22.1,
      flow_rate: 3.58,
      water_Y2: 1,
    }))).resolves.toBe(0)
  })
})
