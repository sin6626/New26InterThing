import {
  describe,
  expect,
  it,
} from 'vitest'

import { createSafetySupervisor } from '../src/modules/safety/state/supervisor.js'
import type {
  SafetyConfig,
  SafetyContext,
  SafetyReading,
} from '../src/modules/safety/types.js'

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

  it('keeps cooling flow only when the hydraulic path is safe', () => {
    const safeSupervisor = createSafetySupervisor(() => 1_000)
    expect(safeSupervisor.handleReading({
      ...reading(),
      outletTemperature: 45,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toMatchObject({
      faultCode: 'OVER_TEMPERATURE',
      stopPump: false,
    })

    const unsafeSupervisor = createSafetySupervisor(() => 1_000)
    expect(unsafeSupervisor.handleReading({
      ...reading(),
      flowRate: 0,
      outletTemperature: 45,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toMatchObject({
      faultCode: 'OVER_TEMPERATURE',
      stopPump: true,
    })
  })

  it('upgrades a latched cooling fault to stop the pump when flow becomes unsafe', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    expect(supervisor.handleReading({
      ...reading(now),
      outletTemperature: 45,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toMatchObject({
      faultCode: 'OVER_TEMPERATURE',
      stopPump: false,
    })
    now = 2_000

    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
      actualHeater: 'off',
    }, context({
      state: 'fault',
      desiredHeater: 'off',
    }))).toMatchObject({
      faultCode: 'OVER_TEMPERATURE',
      stopPump: true,
    })
  })

  it('upgrades cooling protection when the actual pump state becomes unknown', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    supervisor.handleReading({
      ...reading(now),
      outletTemperature: 45,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))
    now = 2_000

    expect(supervisor.handleReading({
      ...reading(now),
      actualPump: 'unknown',
      actualHeater: 'off',
    }, context({ state: 'fault' }))).toMatchObject({
      faultCode: 'OVER_TEMPERATURE',
      stopPump: true,
    })
  })

  it('upgrades cooling protection on tick when hydraulic facts expire', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    supervisor.handleReading({
      ...reading(now),
      outletTemperature: 45,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))
    now = 4_001

    expect(supervisor.tick(context({ state: 'fault' }))).toMatchObject({
      faultCode: 'OVER_TEMPERATURE',
      stopPump: true,
    })
  })

  it('stops the pump for cooling low flow even when temperature is invalid', () => {
    const supervisor = createSafetySupervisor(() => 1_000)

    expect(supervisor.handleReading({
      ...reading(),
      flowRate: 0,
      inletTemperature: Number.NaN,
    }, context({ state: 'cooling' }))).toMatchObject({
      faultCode: 'LOW_FLOW',
      stopPump: true,
    })
  })

  it('prioritizes actual over-pressure over a simultaneous invalid temperature', () => {
    const supervisor = createSafetySupervisor(() => 1_000)

    expect(supervisor.handleReading({
      ...reading(),
      pressure: 130,
      inletTemperature: Number.NaN,
    }, context())).toMatchObject({
      faultCode: 'OVER_PRESSURE',
      stopPump: true,
      detail: expect.stringContaining('温度传感器数据超时或无效'),
    })
  })

  it('stops the pump when running low flow coincides with invalid temperature', () => {
    const supervisor = createSafetySupervisor(() => 1_000)

    expect(supervisor.handleReading({
      ...reading(),
      flowRate: 0,
      inletTemperature: Number.NaN,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toMatchObject({
      faultCode: 'SENSOR_TEMPERATURE_TIMEOUT',
      stopPump: true,
      detail: expect.stringContaining('当前流量低于安全阈值'),
    })
  })

  it('marks an explicitly invalid pressure immediately instead of keeping it fresh', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    supervisor.handleReading(reading(now), context())
    now = 2_000

    expect(supervisor.handleReading({
      ...reading(now),
      pressure: Number.NaN,
    }, context())).toMatchObject({ faultCode: 'SENSOR_PRESSURE_TIMEOUT' })
    expect(supervisor.getSnapshot().sensors.pressure).toBe('invalid')
  })

  it('prioritizes a missing pressure sensor and retains concurrent over-temperature facts', () => {
    const supervisor = createSafetySupervisor(() => 1_000)

    expect(supervisor.handleReading({
      ...reading(),
      pressure: null,
      outletTemperature: 45,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toMatchObject({
      faultCode: 'SENSOR_PRESSURE_TIMEOUT',
      detail: expect.stringContaining('水温达到或超过安全上限'),
    })
  })

  it('ignores static pressure at the limit while the pump is actually off', () => {
    const supervisor = createSafetySupervisor(() => 1_000)

    expect(supervisor.handleReading({
      ...reading(),
      pressure: 130,
      actualPump: 'off',
    }, context({ state: 'stopped', desiredPump: 'off' }))).toBeNull()
  })

  it('blocks manual starts while automatic control or cooling owns the actuators', () => {
    const supervisor = createSafetySupervisor(() => 1_000)
    supervisor.handleReading(reading(), context())

    expect(supervisor.authorize(
      { topic: 'pump', value: 'on' },
      context(),
      'manual',
    )).toMatchObject({ allowed: false })
    expect(supervisor.authorize(
      { topic: 'heater', value: 'on' },
      context({ state: 'cooling' }),
      'manual',
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

  it('keeps zero pressure as a valid reading for other safety rules', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    expect(supervisor.handleReading({
      ...reading(now),
      pressure: 0,
    }, context())).toBeNull()

    for (now = 2_000; now <= 4_000; now += 1_000) {
      expect(supervisor.handleReading({
        ...reading(now),
        pressure: 0,
      }, context())).toBeNull()
    }
    expect(supervisor.getSnapshot().sensors.pressure).toBe('ok')
  })

  it('treats the device disconnected sentinel as an invalid sensor reading', () => {
    const pressureSupervisor = createSafetySupervisor(() => 1_000)
    expect(pressureSupervisor.handleReading({
      ...reading(),
      pressure: 6_553.5,
    }, context())).toMatchObject({
      faultCode: 'SENSOR_PRESSURE_TIMEOUT',
    })
    expect(pressureSupervisor.getSnapshot().sensors.pressure).toBe('invalid')

    const temperatureSupervisor = createSafetySupervisor(() => 1_000)
    expect(temperatureSupervisor.handleReading({
      ...reading(),
      outletTemperature: 6_553.5,
      actualHeater: 'on',
    }, context({ desiredHeater: 'on' }))).toMatchObject({
      faultCode: 'SENSOR_TEMPERATURE_TIMEOUT',
    })
    expect(temperatureSupervisor.getSnapshot().sensors.outletTemperature).toBe('invalid')
  })

  it('keeps the last valid sensor fact when a partial message omits the field', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    supervisor.handleReading(reading(now), context())
    now = 2_000

    expect(supervisor.handleReading({
      ...reading(now),
      pressure: null,
      inletTemperature: null,
    }, context())).toBeNull()
    expect(supervisor.getSnapshot().sensors).toMatchObject({
      pressure: 'ok',
      inletTemperature: 'ok',
    })

    now = 4_001
    expect(supervisor.tick(context())).toMatchObject({
      faultCode: 'SENSOR_PRESSURE_TIMEOUT',
    })
  })

  it('ignores reversed temperatures while building flow and starts observing after running', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const reversedReading = () => ({
      ...reading(now),
      inletTemperature: 32,
      outletTemperature: 31,
    })

    supervisor.handleReading(reversedReading(), context({ state: 'building-flow' }))
    now = 7_000
    expect(supervisor.handleReading(
      reversedReading(),
      context({ state: 'building-flow' }),
    )).toBeNull()
    now = 8_000
    expect(supervisor.handleReading(reversedReading(), context())).toBeNull()
    now = 13_000

    expect(supervisor.handleReading(reversedReading(), context())).toMatchObject({
      faultCode: 'TEMP_SENSOR_REVERSED',
    })
  })

  it('accumulates reversed-temperature evidence across dead-band jitter without requiring heat', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const configuredContext = context({
      config: { ...config, dataTimeoutSeconds: 10 },
    })

    supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31.4,
      outletTemperature: 31,
    }, configuredContext)
    now = 4_000
    expect(supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31.2,
      outletTemperature: 31,
      flowRate: 0.45,
    }, configuredContext)).toBeNull()
    now = 6_000

    expect(supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31.4,
      outletTemperature: 31,
    }, configuredContext)).toBeNull()
    now = 9_000

    expect(supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31.4,
      outletTemperature: 31,
    }, configuredContext)).toMatchObject({ faultCode: 'TEMP_SENSOR_REVERSED' })
  })

  it('reduces reversed-temperature evidence only after a clearly normal temperature direction', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const configuredContext = context({
      config: { ...config, dataTimeoutSeconds: 10 },
    })

    supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31.4,
      outletTemperature: 31,
    }, configuredContext)
    now = 5_000
    supervisor.handleReading({
      ...reading(now),
      inletTemperature: 30.8,
      outletTemperature: 31,
    }, configuredContext)
    now = 6_000
    expect(supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31.4,
      outletTemperature: 31,
    }, configuredContext)).toBeNull()
    now = 10_000

    expect(supervisor.handleReading({
      ...reading(now),
      inletTemperature: 31.4,
      outletTemperature: 31,
    }, configuredContext)).toMatchObject({ faultCode: 'TEMP_SENSOR_REVERSED' })
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

  it('pauses no-rise timing while heating is ineffective', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const heatingReading = () => ({
      ...reading(now),
      outletTemperature: 31,
      actualHeater: 'on' as const,
    })
    supervisor.handleReading(heatingReading(), context({ desiredHeater: 'on' }))
    now = 31_000
    supervisor.handleReading({
      ...heatingReading(),
      actualHeater: 'off',
    }, context({ desiredHeater: 'on' }))
    now = 91_000
    expect(supervisor.handleReading(
      heatingReading(),
      context({ desiredHeater: 'on' }),
    )).toBeNull()
    now = 121_000

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

  it('does not apply running low-flow confirmation during automatic flow building', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const buildingContext = () => context({
      state: 'building-flow',
      stateEnteredAt: 1_000,
      desiredPump: 'on',
    })
    supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
      actualPump: 'off',
    }, buildingContext())
    now = 3_000

    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
      actualPump: 'on',
    }, buildingContext())).toBeNull()
  })

  it('keeps continuous zero flow in the build phase until the build timeout', () => {
    let now = 1_000
    const supervisor = createSafetySupervisor(() => now)
    const buildingContext = () => context({
      state: 'building-flow',
      stateEnteredAt: 1_000,
      desiredPump: 'on',
    })
    for (now = 1_000; now <= 4_000; now += 1_000) {
      expect(supervisor.handleReading({
        ...reading(now),
        flowRate: 0,
        pressure: 0,
      }, buildingContext())).toBeNull()
      expect(supervisor.tick(buildingContext())).toBeNull()
    }
    now = 6_000

    expect(supervisor.tick(buildingContext())).toMatchObject({
      faultCode: 'BUILD_FLOW_TIMEOUT',
    })
  })

  it('does not report manual pump idling before its build-flow timeout', () => {
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
    now = 3_000

    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
      actualPump: 'on',
    }, manualContext())).toBeNull()
  })

  it('uses confirmed LOW_FLOW after a manual pump has successfully built flow', () => {
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
    now = 2_000
    supervisor.handleReading(reading(now), manualContext())
    now = 3_000
    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
    }, manualContext())).toBeNull()
    now = 5_000

    expect(supervisor.handleReading({
      ...reading(now),
      flowRate: 0,
    }, manualContext())).toMatchObject({ faultCode: 'LOW_FLOW' })
  })
})
