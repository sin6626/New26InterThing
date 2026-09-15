/**
 * 阅读导航：自动控制配置读取：从 t_direct_config 与 t_direct_global 取得现场参数，再校验范围；非法配置不能让自动模式带病启动。
 * 入口位置：modules/automation/adapters/config.mysql.ts
 */

import type { Pool, RowDataPacket } from 'mysql2/promise'

import type { AutomationConfig } from '../types.js'

const aliases: Record<string, string> = {
  pid_min_open_time: 'pid_min_on_time',
  pid_min_close_time: 'pid_min_off_time',
}

export const createAutomationConfigLoader = (pool: Pool) => async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `select c.topic, g.value
     from t_direct_config c
     left join t_direct_global g on g.config_id = c.id`,
  )
  const values = new Map<string, string>()
  for (const row of rows) {
    const topic = aliases[String(row.topic)] ?? String(row.topic)
    if (row.value !== null) values.set(topic, String(row.value))
  }
  const getRequiredNumber = (topic: string) => {
    const value = Number(values.get(topic))
    if (!Number.isFinite(value)) {
      throw new Error(`控制参数 ${topic} 未配置或不是有效数字`)
    }
    return value
  }
  const positive = (topic: string) => {
    const value = getRequiredNumber(topic)
    if (value <= 0) {
      throw new Error(`控制参数 ${topic} 必须大于 0`)
    }
    return value
  }
  const nonNegative = (topic: string) => {
    const value = getRequiredNumber(topic)
    if (value < 0) {
      throw new Error(`控制参数 ${topic} 必须大于或等于 0`)
    }
    return value
  }
  const strategy = values.get('temperature_control_strategy')
  if (strategy !== 'hysteresis' && strategy !== 'pid') {
    throw new Error('控制参数 temperature_control_strategy 必须是 hysteresis 或 pid')
  }
  const targetTemperature = positive('target_temperature')
  const temperatureHysteresis = positive('temperature_hysteresis')
  const maxSafeTemperature = positive('max_safe_temperature')
  const config: AutomationConfig = {
    strategy,
    targetTemperature,
    temperatureHysteresis,
    minSafeFlow: positive('min_safe_flow'),
    buildFlowTimeoutSeconds: positive('build_flow_timeout'),
    coolingDelaySeconds: positive('cooling_delay'),
    dataTimeoutSeconds: positive('data_timeout'),
    lowFlowConfirmSeconds: positive('low_flow_confirm_time'),
    maxSafePressure: positive('max_safe_pressure'),
    maxSafeTemperature,
    temperatureReversedConfirmSeconds: positive('temp_reversed_confirm_time'),
    dryHeatingTimeoutSeconds: positive('dry_heating_timeout'),
    dryHeatingTemperatureDifference: positive('dry_heating_temp_diff'),
    pid: {
      targetTemperature,
      kp: nonNegative('pid_kp'),
      ki: nonNegative('pid_ki'),
      kd: nonNegative('pid_kd'),
      cycleSeconds: positive('pid_cycle_time'),
      minOnSeconds: positive('pid_min_on_time'),
      minOffSeconds: positive('pid_min_off_time'),
      overshootAllowance: nonNegative('pid_overshoot_allowance'),
      resumeHysteresis: positive('pid_resume_hysteresis'),
    },
  }
  if (targetTemperature >= maxSafeTemperature) {
    throw new Error('目标温度必须低于最高安全温度')
  }
  if (temperatureHysteresis >= targetTemperature) {
    throw new Error('温度回差必须小于目标温度')
  }
  if (strategy === 'pid' && config.pid.kp <= 0) {
    throw new Error('PID 模式启动前必须设置 pid_kp > 0')
  }
  if (config.pid.cycleSeconds < config.pid.minOnSeconds + config.pid.minOffSeconds) {
    throw new Error('PID 周期必须不小于最短开启与关闭时间之和')
  }
  for (const [topic, value] of [
    ['pid_cycle_time', config.pid.cycleSeconds],
    ['pid_min_on_time', config.pid.minOnSeconds],
    ['pid_min_off_time', config.pid.minOffSeconds],
  ] as const) {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`控制参数 ${topic} 必须是正整数秒`)
    }
  }
  if (targetTemperature + config.pid.overshootAllowance >= maxSafeTemperature) {
    throw new Error('PID 强制关热温度必须低于最高安全温度')
  }
  if (config.pid.resumeHysteresis >= targetTemperature) {
    throw new Error('PID 恢复回差必须小于目标温度')
  }
  positive('command_timeout')
  positive('pipe_inner_diameter')
  return config
}
