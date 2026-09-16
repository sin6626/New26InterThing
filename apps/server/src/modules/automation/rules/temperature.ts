/**
 * 阅读导航：纯温控计算：回差防止频繁抖动，时间比例 PID 把连续占空比转换为继电器开关窗口；不接数据库或 MQTT。
 * 入口位置：modules/automation/rules/temperature.ts
 */

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
  // 落在两条阈值之间时沿用当前开关，避免温度微小波动导致继电器反复切换。
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
    /**
     * 重置自动控制当前状态；只清理本函数负责的数据，不会隐式启动设备。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    reset() {
      integral = 0
      previousTemperature = undefined
      previousAt = undefined
      windowStartedAt = undefined
      overshootBlocked = false
    },

    /**
     * 更新自动控制状态，并返回或广播更新后的结果。
     * @param temperature 当前用于温控计算的温度值。
     * @param config 从后台配置读取并校验后的业务参数。
     * @param _current 兼容状态更新接口保留的当前值，本实现无需直接使用。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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
      // 比例项看当前误差，积分项记长期误差，微分项看温度变化速度；
      // 这里微分对测量温度取负号，升温过快时会降低加热需求。
      const elapsedSeconds = previousAt === undefined
        ? 0
        : Math.max(0, (now - previousAt) / 1_000)
      const derivative = previousTemperature === undefined || elapsedSeconds === 0
        ? 0
        : -(temperature - previousTemperature) / elapsedSeconds

      if (elapsedSeconds > 0) {
        // 只在候选输出仍处于 0~100% 时接受新的积分，避免积分无限累积后
        // 即使温度恢复也长期无法退出加热（积分饱和）。
        const candidate = integral + error * elapsedSeconds
        const candidateOutput = config.kp * error
          + config.ki * candidate
          + config.kd * derivative
        if (candidateOutput >= 0 && candidateOutput <= 100) integral = candidate
      }

      previousTemperature = temperature
      previousAt = now

      if (temperature >= config.targetTemperature + config.overshootAllowance) {
        // 超调后强制关热；必须降到较低的恢复阈值才解除，形成安全回差。
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
      // PID 的百分比最后会变成一个周期内“开几秒”；继电器不能接受
      // 太短的开/关时间，因此下面按配置裁剪占空比。
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
      // 只在本周期前 plannedOnSeconds 内要求开启，余下时间要求关闭。
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
