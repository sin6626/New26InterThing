import {
  describe,
  expect,
  it,
} from 'vitest'

import { createSafetySupervisor } from '../src/modules/safety/safety-supervisor.js'
import type {
  SafetyConfig,
  SafetyContext,
  SafetyReading,
} from '../src/modules/safety/safety.types.js'

const config: SafetyConfig = {
  minSafeFlow: 0.5,
  maxSafePressure: 130,
  maxSafeTemperature: 45,
  dataTimeoutSeconds: 3,
  lowFlowConfirmSeconds: 2,
  buildFlowTimeoutSeconds: 5,
  temperatureReversedConfirmSeconds: 5,
  dryHeatingTimeoutSeconds: 60,
  dryHeatingTemperatureDifference: 0.1,
}

const reading = (recordedAt = 1_000): SafetyReading => ({
  recordedAt,
  flowRate: 1,
  pressure: 60,
  inletTemperature: 30,
  outletTemperature: 31,
  actualPump: 'on',
  actualHeater: 'off',
})

const context = (overrides: Partial<SafetyContext> = {}): SafetyContext => ({
  state: 'running',
  desiredPump: 'on',
  desiredHeater: 'off',
  config,
  ...overrides,
})

describe('safety supervisor', () => {
  it('allows heating only with fresh safe readings and actual flow', () => {
    const supervisor = createSafetySupervisor(() => 1_000)
    supervisor.handleReading(reading(), context())

    expect(supervisor.authorize(
      { topic: 'heater', value: 'on' },
      context(),
    )).toEqual({ allowed: true, reason: null })

    expect(supervisor.authorize(
      { topic: 'heater', value: 'off' },
      context(),
    )).toEqual({ allowed: true, reason: null })
  })

  it('latches over-temperature at the configured boundary', () => {
    const supervisor = createSafetySupervisor(() => 1_000)
    const decision = supervisor.handleReading({
      ...reading(),
      outletTemperature: 45,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))

    expect(decision).toMatchObject({
      faultCode: 'OVER_TEMPERATURE',
      closeHeater: true,
    })
    expect(supervisor.getSnapshot()).toMatchObject({
      locked: true,
      faultCode: 'OVER_TEMPERATURE',
      resetAllowed: false,
    })
    expect(supervisor.authorize(
      { topic: 'heater', value: 'on' },
      context(),
    )).toMatchObject({ allowed: false })
  })

  it('treats equal inlet and outlet temperatures as correctly oriented', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31,
      outletTemperature: 31,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))
    now = 7_000

    expect(supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31,
      outletTemperature: 31,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toBeNull()
  })

  it('allows reset only after safe fresh readings and both actuators are off', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    supervisor.handleReading({
      ...reading(),
      pressure: 130,
    }, context())
    now = 2_000
    supervisor.handleReading({
      ...reading(now),
      actualPump: 'off',
      actualHeater: 'off',
    }, context({
      state: 'fault',
      desiredPump: 'off',
      desiredHeater: 'off',
    }))

    expect(supervisor.canReset(context({
      state: 'fault',
      desiredPump: 'off',
      desiredHeater: 'off',
    }))).toEqual({ allowed: true, reason: null })
    supervisor.reset()
    expect(supervisor.getSnapshot().locked).toBe(false)
  })

  it('stops the pump immediately when cooling loses flow', () => {
    const supervisor = createSafetySupervisor(() => 1_000)

    expect(supervisor.handleReading({
      ...reading(),
      flowRate: 0,
      actualHeater: 'off',
    }, context({
      state: 'cooling',
      desiredHeater: 'off',
    }))).toMatchObject({
      faultCode: 'LOW_FLOW',
      closeHeater: true,
      stopPump: true,
    })
  })

  it('closes heat immediately and locks after low flow is sustained', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0.2,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toBeNull()
    expect(supervisor.authorize(
      { topic: 'heater', value: 'on' },
      context({ desiredHeater: 'on' }),
    )).toMatchObject({ allowed: false })

    now = 3_000
    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0.2,
      actualHeater: 'off',
    }, context())).toMatchObject({ faultCode: 'LOW_FLOW' })
  })

  it('detects independent sensor timeout without a new MQTT message', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    supervisor.handleReading(reading(now), context())
    now = 4_001

    expect(supervisor.tick(context())).toMatchObject({
      faultCode: 'SENSOR_PRESSURE_TIMEOUT',
      stopPump: true,
    })
  })

  it('confirms reversed probes only while inlet stays above outlet', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const reversedReading = () => ({
      ...reading(now),
      inletTemperature: 32,
      outletTemperature: 31,
      actualHeater: 'on' as const,
    })
    supervisor.handleReading(reversedReading(), context({ desiredHeater: 'on' }))
    now = 4_000
    expect(supervisor.handleReading(
      reversedReading(),
      context({ desiredHeater: 'on' }),
    )).toBeNull()
    now = 6_000

    expect(supervisor.handleReading(
      reversedReading(),
      context({ desiredHeater: 'on' }),
    )).toMatchObject({ faultCode: 'TEMP_SENSOR_REVERSED' })
  })

  it('detects no outlet temperature rise after effective heating time', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const heatingReading = () => ({
      ...reading(now),
      outletTemperature: 31,
      actualHeater: 'on' as const,
    })
    supervisor.handleReading(heatingReading(), context({ desiredHeater: 'on' }))
    now = 61_000

    expect(supervisor.handleReading(
      heatingReading(),
      context({ desiredHeater: 'on' }),
    )).toMatchObject({ faultCode: 'DRY_HEATING_NO_TEMP_RISE' })
  })

  it('reports pump idling when a manual pump start cannot build flow', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const manualContext = () => context({
      state: 'stopped',
      manualPumpStartedAt: 1_000,
      desiredPump: 'on',
    })
    supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
      actualPump: 'off',
    }, manualContext())
    now = 6_000

    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
      actualPump: 'on',
    }, manualContext())).toMatchObject({ faultCode: 'PUMP_IDLING' })
  })
})
