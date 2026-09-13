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
  it('refuses to start until a recent sensor reading is available', async () => {
    let now = 5_000
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

    await expect(engine.setEnabled(true)).rejects.toThrow('最近传感器数据不可用')
    expect(execute).not.toHaveBeenCalled()

    now = 6_000
    await engine.handleReading({
      recordedAt: now,
      flowRate: 0,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })

    await expect(engine.setEnabled(true)).resolves.toMatchObject({
      enabled: true,
      state: 'building-flow',
    })
    expect(execute).toHaveBeenCalledWith('pump', 'on')
  })

  it('refuses to start when the recent reading lacks control values', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
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

    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: null,
      outletTemperature: null,
      actualPump: 'unknown',
      actualHeater: 'unknown',
    })

    await expect(engine.setEnabled(true)).rejects.toThrow('最近传感器数据不可用')
    expect(execute).not.toHaveBeenCalled()
  })

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

    await engine.handleReading({
      recordedAt: now,
      flowRate: 0,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
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
    await engine.handleReading({
      recordedAt: now,
      flowRate: 0,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
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

  it('keeps the requested heater state visible when the safety gate blocks publishing', async () => {
    const now = Date.now()
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      loadConfig: vi.fn().mockResolvedValue(config),
      execute: vi.fn(async (topic, value) => {
        if (topic === 'heater' && value === 'on') {
          throw Object.assign(
            new Error('安全保护尚未完成，当前禁止人工开启加热'),
            { code: 'HEATER_SAFETY_BLOCKED' },
          )
        }
      }),
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

    await engine.handleReading({
      recordedAt: now,
      flowRate: 0,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })
    const snapshot = await engine.getSnapshot()

    expect(snapshot.desiredHeater).toBe('on')
    expect(snapshot.lastAction).toMatchObject({
      topic: 'heater',
      value: 'on',
      status: 'blocked',
    })
  })

  it('turns master off and records the reason when building flow times out', async () => {
    let now = 1_000
    const disableMaster = vi.fn()
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => now,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute: vi.fn(),
      disableMaster,
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

    await engine.handleReading({
      recordedAt: now,
      flowRate: 0,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    now = 6_000
    await engine.tick()

    expect(disableMaster).toHaveBeenCalledWith('启动超时，未建立安全流量')
    expect((await engine.getSnapshot()).enabled).toBe(false)
  })

  it('advances the PID time window from tick without a new sensor message', async () => {
    let now = 1_000
    const execute = vi.fn().mockResolvedValue(undefined)
    const pidConfig = {
      ...config,
      strategy: 'pid' as const,
    }
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => now,
      loadConfig: vi.fn().mockResolvedValue(pidConfig),
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

    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      outletTemperature: 33,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      outletTemperature: 33,
      actualPump: 'on',
      actualHeater: 'off',
    })
    expect(execute).toHaveBeenCalledWith('heater', 'on')

    now = 6_000
    await engine.tick()

    expect(execute).toHaveBeenLastCalledWith('heater', 'off')
    expect((await engine.getSnapshot()).pid?.desired).toBe('off')
  })

  it('enters cooling and disables master after a heater publish failure', async () => {
    const disableMaster = vi.fn().mockResolvedValue(undefined)
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute: vi.fn(async (topic, value) => {
        if (topic === 'heater' && value === 'on') {
          throw new Error('MQTT 发布超时')
        }
      }),
      disableMaster,
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

    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    expect(await engine.getSnapshot()).toMatchObject({
      enabled: false,
      state: 'cooling',
      desiredHeater: 'off',
      limitationReason: 'MQTT 发布超时',
    })
    expect(disableMaster).toHaveBeenCalledWith('MQTT 发布超时')
  })

  it('keeps cooling state when the failed command is heater off', async () => {
    const disableMaster = vi.fn().mockResolvedValue(undefined)
    let failHeaterOff = false
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute: vi.fn(async (topic, value) => {
        if (topic === 'heater' && value === 'off' && failHeaterOff) {
          throw new Error('关热指令发布失败')
        }
      }),
      disableMaster,
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
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    failHeaterOff = true
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      outletTemperature: 35,
      actualPump: 'on',
      actualHeater: 'on',
    })

    expect(await engine.getSnapshot()).toMatchObject({
      enabled: false,
      state: 'cooling',
      desiredHeater: 'off',
      limitationReason: '关热指令发布失败',
    })
    expect(disableMaster).toHaveBeenCalledWith('关热指令发布失败')
  })

  it('serializes sensor and tick decisions without duplicate commands', async () => {
    let releaseHeater = () => {}
    let notifyHeaterStarted = () => {}
    const heaterStarted = new Promise<void>((resolve) => {
      notifyHeaterStarted = resolve
    })
    const heaterReleased = new Promise<void>((resolve) => {
      releaseHeater = resolve
    })
    const execute = vi.fn(async (topic: string, value: string) => {
      if (topic === 'heater' && value === 'on') {
        notifyHeaterStarted()
        await heaterReleased
      }
    })
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
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
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)

    const reading = engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })
    await heaterStarted
    const ticking = engine.tick()
    releaseHeater()
    await Promise.all([reading, ticking])

    const heaterStarts = execute.mock.calls.filter(([topic, value]) => (
      topic === 'heater' && value === 'on'
    ))
    expect(heaterStarts).toHaveLength(1)
  })
})
