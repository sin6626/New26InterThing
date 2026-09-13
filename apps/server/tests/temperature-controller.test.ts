import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  createTemperatureController,
  hysteresisDemand,
} from '../src/modules/automation/temperature-controller.js'

describe('temperature controller', () => {
  it('uses hysteresis without chattering inside the dead band', () => {
    expect(hysteresisDemand(34, 35, 0.5, 'off')).toBe('on')
    expect(hysteresisDemand(34.8, 35, 0.5, 'on')).toBe('on')
    expect(hysteresisDemand(35, 35, 0.5, 'on')).toBe('off')
  })

  it('turns PID output into a stable time-proportion window', () => {
    const controller = createTemperatureController(() => 0)
    const config = {
      targetTemperature: 35,
      kp: 10,
      ki: 0,
      kd: 0,
      cycleSeconds: 20,
      minOnSeconds: 3,
      minOffSeconds: 3,
      overshootAllowance: 0.1,
      resumeHysteresis: 0.3,
    }

    const result = controller.update(33, config, 'off')

    expect(result.outputPercent).toBe(20)
    expect(result.plannedDutyPercent).toBe(20)
    expect(result.desired).toBe('on')
    expect(result.windowRemainingSeconds).toBe(20)
  })

  it('reduces duty to preserve the configured minimum off time', () => {
    const controller = createTemperatureController(() => 0)
    const result = controller.update(26, {
      targetTemperature: 35,
      kp: 10,
      ki: 0,
      kd: 0,
      cycleSeconds: 20,
      minOnSeconds: 3,
      minOffSeconds: 3,
      overshootAllowance: 0.1,
      resumeHysteresis: 0.3,
    }, 'off')

    expect(result.outputPercent).toBe(90)
    expect(result.plannedDutyPercent).toBe(85)
    expect(result.limitationReason).toBe('保留最短关闭时间')
  })
})
