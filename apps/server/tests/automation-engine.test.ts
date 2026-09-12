import {
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { createAutomationEngine } from '../src/modules/automation/automation-engine.js'

const config = {
  strategy: 'hysteresis' as const,
  targetTemperature: 35,
  temperatureHysteresis: 0.5,
  minSafeFlow: 0.5,
  buildFlowTimeoutSeconds: 5,
  coolingDelaySeconds: 10,
  dataTimeoutSeconds: 3,
  pid: {
    targetTemperature: 35,
    kp: 10,
    ki: 0,
    kd: 0,
    cycleSeconds: 20,
    minOnSeconds: 3,
    minOffSeconds: 3,
    overshootAllowance: 0.1,
    resumeHysteresis: 0.3,
  },
}

describe('automation engine', () => {
  it('starts by opening only the pump and enters running after actual flow', async () => {
    let now = 1_000
    const execute = vi.fn().mockResolvedValue(undefined)
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => now,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute,
      getWaterFlow: vi.fn().mockResolvedValue({
        deviceNumber: 'device-1',
        flowRateLitersPerMinute: 0,
        averageFlowOneMinute: 0,
        flowVelocityMetersPerSecond: null,
        velocityStatus: 'unconfigured',
        pipeInnerDiameterMillimeters: null,
        totalVolumeLiters: 0,
        updatedAt: null,
      }),
      emit: vi.fn(),
    })

    expect((await engine.setEnabled(true)).state).toBe('building-flow')
    expect(execute).toHaveBeenCalledWith('pump', 'on')
    expect(execute).not.toHaveBeenCalledWith('master', 'on')

    now = 2_000
    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    expect((await engine.getSnapshot()).state).toBe('running')
    expect(execute).toHaveBeenCalledWith('heater', 'on')
  })

  it('stops heat before cooling and turns the pump off after the delay', async () => {
    let now = 1_000
    const execute = vi.fn().mockResolvedValue(undefined)
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => now,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute,
      getWaterFlow: vi.fn().mockResolvedValue({
        deviceNumber: 'device-1',
        flowRateLitersPerMinute: 1,
        averageFlowOneMinute: 1,
        flowVelocityMetersPerSecond: null,
        velocityStatus: 'unconfigured',
        pipeInnerDiameterMillimeters: null,
        totalVolumeLiters: 0,
        updatedAt: null,
      }),
      emit: vi.fn(),
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    expect((await engine.setEnabled(false)).state).toBe('cooling')
    expect(execute).toHaveBeenCalledWith('heater', 'off')
    now = 11_000
    await engine.tick()

    expect(execute).toHaveBeenLastCalledWith('pump', 'off')
    expect((await engine.getSnapshot()).state).toBe('stopped')
  })
})
