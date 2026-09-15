import type {
  ActuatorValue,
  PidSnapshot,
} from '@new26interthing/shared'

export interface PidConfig {
  targetTemperature: number
  kp: number
  ki: number
  kd: number
  cycleSeconds: number
  minOnSeconds: number
  minOffSeconds: number
  overshootAllowance: number
  resumeHysteresis: number
}

/** 在目标温度附近保留回差区，防止加热继电器频繁抖动。 */
export const hysteresisDemand = (
  temperature: number,
  target: number,
  hysteresis: number,
  current: ActuatorValue,
): ActuatorValue => {
  if (temperature <= target - hysteresis) return 'on'
  if (temperature >= target) return 'off'
  return current
}

/** 时间比例 PID：把连续输出百分比转换为一个控制窗口内的开关占空比。 */
export const createTemperatureController = (
  clock: () => number = Date.now,
) => {
  let integral = 0
  let previousTemperature: number | undefined
  let previousAt: number | undefined
  let windowStartedAt: number | undefined
  let overshootBlocked = false

  return {
    reset() {
      integral = 0
      previousTemperature = undefined
      previousAt = undefined
      windowStartedAt = undefined
      overshootBlocked = false
    },

    update(
      temperature: number,
      config: PidConfig,
      _current: ActuatorValue,
    ): PidSnapshot {
      const now = clock()
      if (windowStartedAt === undefined) windowStartedAt = now
      const cycleMilliseconds = config.cycleSeconds * 1_000
      if (now - windowStartedAt >= cycleMilliseconds) {
        windowStartedAt = now - ((now - windowStartedAt) % cycleMilliseconds)
      }

      const error = config.targetTemperature - temperature
      const elapsedSeconds = previousAt === undefined
        ? 0
        : Math.max(0, (now - previousAt) / 1_000)
      const derivative = previousTemperature === undefined || elapsedSeconds === 0
        ? 0
        : -(temperature - previousTemperature) / elapsedSeconds

      if (elapsedSeconds > 0) {
        const candidate = integral + error * elapsedSeconds
        const candidateOutput = config.kp * error
          + config.ki * candidate
          + config.kd * derivative
        if (candidateOutput >= 0 && candidateOutput <= 100) integral = candidate
      }

      previousTemperature = temperature
      previousAt = now

      if (temperature >= config.targetTemperature + config.overshootAllowance) {
        overshootBlocked = true
      }
      if (temperature <= config.targetTemperature - config.resumeHysteresis) {
        overshootBlocked = false
      }

      const rawOutput = config.kp * error
        + config.ki * integral
        + config.kd * derivative
      const outputPercent = overshootBlocked
        ? 0
        : Math.min(100, Math.max(0, rawOutput))
      let plannedDutyPercent = outputPercent
      let limitationReason: string | null = overshootBlocked ? '温度超调，暂停加热' : null
      const onSeconds = config.cycleSeconds * outputPercent / 100
      if (onSeconds > 0 && onSeconds < config.minOnSeconds) {
        plannedDutyPercent = 0
        limitationReason = '低于最短开启时间'
      }
      if (
        onSeconds < config.cycleSeconds
        && config.cycleSeconds - onSeconds < config.minOffSeconds
      ) {
        plannedDutyPercent = (
          config.cycleSeconds - config.minOffSeconds
        ) / config.cycleSeconds * 100
        limitationReason = '保留最短关闭时间'
      }
      const elapsedInWindow = (now - windowStartedAt) / 1_000
      const plannedOnSeconds = config.cycleSeconds * plannedDutyPercent / 100

      return {
        outputPercent: Number(outputPercent.toFixed(2)),
        plannedDutyPercent: Number(plannedDutyPercent.toFixed(2)),
        windowRemainingSeconds: Math.max(
          0,
          Math.ceil(config.cycleSeconds - elapsedInWindow),
        ),
        desired: elapsedInWindow < plannedOnSeconds ? 'on' : 'off',
        limitationReason,
      }
    },
  }
}
