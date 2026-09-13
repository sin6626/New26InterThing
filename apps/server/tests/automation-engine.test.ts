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
  lowFlowConfirmSeconds: 2,
  maxSafePressure: 130,
  maxSafeTemperature: 45,
  temperatureReversedConfirmSeconds: 5,
  dryHeatingTimeoutSeconds: 60,
  dryHeatingTemperatureDifference: 0.1,
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
  it('loads safety configuration on the first reading and protects immediately', async () => {
    const loadConfig = vi.fn().mockResolvedValue(config)
    const execute = vi.fn().mockResolvedValue(undefined)
    const reportFault = vi.fn().mockResolvedValue(undefined)
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
      loadConfig,
      execute,
      reportFault,
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 45,
      actualPump: 'on',
      actualHeater: 'on',
    })

    expect(loadConfig).toHaveBeenCalledOnce()
    expect(await engine.getSnapshot()).toMatchObject({
      state: 'fault',
      safety: { faultCode: 'OVER_TEMPERATURE' },
    })
    expect(execute).toHaveBeenCalledWith('heater', 'off')
    expect(reportFault).toHaveBeenCalledWith(
      'OVER_TEMPERATURE',
      expect.any(String),
    )
  })

  it('latches configuration failure during manual safety authorization', async () => {
    const reportFault = vi.fn().mockResolvedValue(undefined)
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      loadConfig: vi.fn().mockRejectedValue(new Error('安全阈值缺失')),
      execute: vi.fn(),
      reportFault,
      getWaterFlow: vi.fn(),
      emit: vi.fn(),
    })

    await expect(engine.authorizeAction({
      topic: 'pump',
      value: 'on',
    })).rejects.toThrow('控制配置无效：安全阈值缺失')
    expect(await engine.getSnapshot()).toMatchObject({
      state: 'fault',
      safety: { faultCode: 'CONTROL_CONFIG_INVALID' },
    })
    expect(reportFault).toHaveBeenCalledWith(
      'CONTROL_CONFIG_INVALID',
      expect.any(String),
    )
  })

  it('locks command failure when automatic pump start cannot publish', async () => {
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute: vi.fn().mockRejectedValue(new Error('MQTT 当前未连接')),
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
      flowRate: 0,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })

    await expect(engine.setEnabled(true)).rejects.toThrow('MQTT 当前未连接')
    expect(await engine.getSnapshot()).toMatchObject({
      state: 'fault',
      safety: { faultCode: 'COMMAND_PUBLISH_FAILED' },
    })
  })

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
      pressure: 60,
      inletTemperature: 30,
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
      pressure: null,
      inletTemperature: null,
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
      pressure: 60,
      inletTemperature: 30,
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
      pressure: 60,
      inletTemperature: 30,
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    expect((await engine.setEnabled(false)).state).toBe('cooling')
    expect(execute).toHaveBeenCalledWith('heater', 'off')
    now = 11_000
    await engine.tick()

    expect(execute).toHaveBeenLastCalledWith('pump', 'off')
    expect((await engine.getSnapshot()).state).toBe('fault')
    expect((await engine.getSnapshot()).safety.faultCode).toBe('SENSOR_PRESSURE_TIMEOUT')
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
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

  it('turns master off for the higher-priority sensor timeout during flow building', async () => {
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    now = 6_000
    await engine.tick()

    expect(disableMaster).toHaveBeenCalledWith(
      expect.stringContaining('压力传感器数据超时或无效'),
    )
    expect((await engine.getSnapshot()).enabled).toBe(false)
    expect((await engine.getSnapshot()).state).toBe('fault')
  })

  it('reports an over-pressure fault once and resets only after safe off feedback', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
    const reportFault = vi.fn().mockResolvedValue(undefined)
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute,
      reportFault,
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 31,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)

    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 130,
      inletTemperature: 30,
      outletTemperature: 31,
      actualPump: 'on',
      actualHeater: 'on',
    })
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 0,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 31,
      actualPump: 'off',
      actualHeater: 'off',
    })

    expect(reportFault).toHaveBeenCalledOnce()
    expect(reportFault).toHaveBeenCalledWith(
      'OVER_PRESSURE',
      '管路压力达到或超过安全上限',
    )
    expect((await engine.getSnapshot()).safety.resetAllowed).toBe(true)
    await expect(engine.resetFault()).resolves.toMatchObject({
      state: 'stopped',
      safety: { locked: false },
    })
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 33,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: now,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 33,
      actualPump: 'on',
      actualHeater: 'off',
    })
    expect(execute).toHaveBeenCalledWith('heater', 'on')

    now = 6_000
    await engine.tick()

    expect(execute).toHaveBeenCalledWith('heater', 'off')
    expect(execute).toHaveBeenLastCalledWith('pump', 'off')
    expect((await engine.getSnapshot()).safety.faultCode).toBe('SENSOR_PRESSURE_TIMEOUT')
  })

  it('runs safety timeout protection before waiting for configuration refresh', async () => {
    let now = 1_000
    let loadCount = 0
    let releaseRefresh = () => {}
    const refreshBlocked = new Promise<typeof config>((resolve) => {
      releaseRefresh = () => resolve(config)
    })
    let signalProtected = () => {}
    const protectionTriggered = new Promise<void>((resolve) => {
      signalProtected = resolve
    })
    const execute = vi.fn(async (topic: string, value: string) => {
      if (topic === 'heater' && value === 'off') signalProtected()
    })
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => now,
      loadConfig: vi.fn(() => {
        loadCount += 1
        return loadCount >= 3 ? refreshBlocked : Promise.resolve(config)
      }),
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    now = 5_000

    const ticking = engine.tick()
    await protectionTriggered
    expect(execute).toHaveBeenCalledWith('heater', 'off')
    releaseRefresh()
    await ticking
  })

  it('locks a fault and disables master after a heater publish failure', async () => {
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    expect(await engine.getSnapshot()).toMatchObject({
      enabled: false,
      state: 'fault',
      desiredHeater: 'off',
      limitationReason: '控制指令发布失败：MQTT 发布超时',
    })
    expect(disableMaster).toHaveBeenCalledWith('控制指令发布失败：MQTT 发布超时')
  })

  it('locks a command fault when safety-forced heater shutdown cannot publish', async () => {
    let failHeaterOff = false
    const execute = vi.fn(async (topic: string, value: string) => {
      if (failHeaterOff && topic === 'heater' && value === 'off') {
        throw new Error('安全关热发布失败')
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })
    failHeaterOff = true

    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 0.2,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'on',
    })

    expect(await engine.getSnapshot()).toMatchObject({
      state: 'fault',
      safety: { faultCode: 'COMMAND_PUBLISH_FAILED' },
    })
  })

  it('withdraws manually requested heating on the first unsafe-flow reading', async () => {
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
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'on',
    })
    engine.recordCommand({ topic: 'heater', value: 'on' })

    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 0.2,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'on',
    })

    expect(execute).toHaveBeenCalledWith('heater', 'off')
  })

  it('keeps the last outlet temperature so a partial low-flow reading still closes heat', async () => {
    const execute = vi.fn().mockResolvedValue(undefined)
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })
    execute.mockClear()

    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 0.2,
      pressure: null,
      inletTemperature: null,
      outletTemperature: null,
      actualPump: 'on',
      actualHeater: 'on',
    })

    expect(execute).toHaveBeenCalledWith('heater', 'off')
  })

  it('does not let pending fault persistence block the protection operation', async () => {
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      clock: () => 1_000,
      loadConfig: vi.fn().mockResolvedValue(config),
      execute: vi.fn().mockResolvedValue(undefined),
      reportFault: vi.fn(() => new Promise<void>(() => {})),
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 45,
      actualPump: 'on',
      actualHeater: 'on',
    })

    expect(await engine.getSnapshot()).toMatchObject({ state: 'fault' })
  })

  it('serializes manual publish and state adoption with an arriving safety fault', async () => {
    let releasePublish = () => {}
    let signalPublishing = () => {}
    const publishing = new Promise<void>(resolve => {
      signalPublishing = resolve
    })
    const publishGate = new Promise<void>(resolve => {
      releasePublish = resolve
    })
    const execute = vi.fn().mockResolvedValue(undefined)
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })
    const manualPublish = engine.executeManualAction(
      { topic: 'heater', value: 'on' },
      async () => {
        signalPublishing()
        await publishGate
      },
    )
    await publishing
    const safetyReading = engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 45,
      actualPump: 'on',
      actualHeater: 'on',
    })
    releasePublish()
    await Promise.all([manualPublish, safetyReading])

    expect(await engine.getSnapshot()).toMatchObject({
      state: 'fault',
      desiredHeater: 'off',
    })
    expect(execute).toHaveBeenCalledWith('heater', 'off')
  })

  it('publishes a manual off command without waiting for safety configuration', async () => {
    let signalPublished = () => {}
    const published = new Promise<void>(resolve => {
      signalPublished = resolve
    })
    const engine = createAutomationEngine({
      deviceNumber: 'device-1',
      loadConfig: vi.fn(() => new Promise<typeof config>(() => {})),
      execute: vi.fn(),
      getWaterFlow: vi.fn(),
      emit: vi.fn(),
    })

    const closing = engine.executeManualAction(
      { topic: 'heater', value: 'off' },
      async () => signalPublished(),
    )

    await published
    await closing
    expect(await engine.getSnapshot()).toMatchObject({ desiredHeater: 'off' })
  })

  it('keeps a locked fault when the failed command is heater off', async () => {
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    failHeaterOff = true
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 35,
      actualPump: 'on',
      actualHeater: 'on',
    })

    expect(await engine.getSnapshot()).toMatchObject({
      enabled: false,
      state: 'fault',
      desiredHeater: 'off',
      limitationReason: '安全关热失败：关热指令发布失败',
    })
    expect(disableMaster).toHaveBeenCalledWith('控制指令发布失败：关热指令发布失败')
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)

    const reading = engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
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

  it('locks a fault when manual stop cannot publish heater off', async () => {
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
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'off',
      actualHeater: 'off',
    })
    await engine.setEnabled(true)
    await engine.handleReading({
      recordedAt: 1_000,
      flowRate: 1,
      pressure: 60,
      inletTemperature: 30,
      outletTemperature: 34,
      actualPump: 'on',
      actualHeater: 'off',
    })

    failHeaterOff = true
    await expect(engine.setEnabled(false)).rejects.toThrow('关热指令发布失败')

    expect(await engine.getSnapshot()).toMatchObject({
      enabled: false,
      state: 'fault',
      desiredHeater: 'off',
      limitationReason: '安全关热失败：关热指令发布失败',
    })
    expect(disableMaster).toHaveBeenCalledWith('控制指令发布失败：关热指令发布失败')
  })
})
