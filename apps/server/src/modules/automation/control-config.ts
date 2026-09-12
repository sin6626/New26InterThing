import type { Pool, RowDataPacket } from 'mysql2/promise'

import type { AutomationConfig } from './automation-engine.js'

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
  const number = (topic: string) => {
    const value = Number(values.get(topic))
    if (!Number.isFinite(value)) throw new Error(`控制参数 ${topic} 未配置或不是有效数字`)
    return value
  }
  const positive = (topic: string) => {
    const value = number(topic)
    if (value <= 0) throw new Error(`控制参数 ${topic} 必须大于 0`)
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
    pid: {
      targetTemperature,
      kp: number('pid_kp'),
      ki: number('pid_ki'),
      kd: number('pid_kd'),
      cycleSeconds: positive('pid_cycle_time'),
      minOnSeconds: positive('pid_min_on_time'),
      minOffSeconds: positive('pid_min_off_time'),
      overshootAllowance: number('pid_overshoot_allowance'),
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
  return config
}
