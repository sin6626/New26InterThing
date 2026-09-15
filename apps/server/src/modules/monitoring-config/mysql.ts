/**
 * 阅读导航：监控阈值 MySQL 读取：从后台配置取得离线时长和水力参数，短时缓存避免每条实时消息都查询数据库。
 * 入口位置：modules/monitoring-config/mysql.ts
 */

import type { Pool, RowDataPacket } from 'mysql2/promise'

export interface MonitoringConfig {
  deviceOfflineTimeoutSeconds: number
  dataTimeoutSeconds: number
  minSafeFlow: number
  minOperatingPressure: number
  maxSafePressure: number
  maxSafeTemperature: number
  diagnosisConfirmSeconds: number
}

export const createMonitoringConfigLoader = (
  pool: Pool,
  clock: () => number = Date.now,
) => {
  let cached: { value: MonitoringConfig; loadedAt: number } | undefined
  return async (): Promise<MonitoringConfig> => {
    const now = clock()
    if (cached && now - cached.loadedAt < 2_000) return cached.value
    const [rows] = await pool.query<RowDataPacket[]>(
      `select c.topic, g.value
       from t_direct_config c
       left join t_direct_global g on g.config_id = c.id
       where c.topic in (
         'device_offline_timeout',
         'data_timeout',
         'min_safe_flow',
         'min_operating_pressure',
         'max_safe_pressure',
         'max_safe_temperature',
         'pressure_flow_diagnosis_confirm_time'
       )`,
    )
    const values = new Map(rows.map(row => [String(row.topic), Number(row.value)]))
    const positive = (topic: string) => {
      const value = values.get(topic)
      if (value === undefined || !Number.isFinite(value) || value <= 0) {
        throw new Error(`监控参数 ${topic} 必须是大于 0 的数字`)
      }
      return value
    }
    const config = {
      deviceOfflineTimeoutSeconds: positive('device_offline_timeout'),
      dataTimeoutSeconds: positive('data_timeout'),
      minSafeFlow: positive('min_safe_flow'),
      minOperatingPressure: positive('min_operating_pressure'),
      maxSafePressure: positive('max_safe_pressure'),
      maxSafeTemperature: positive('max_safe_temperature'),
      diagnosisConfirmSeconds: positive('pressure_flow_diagnosis_confirm_time'),
    }
    if (config.minOperatingPressure >= config.maxSafePressure) {
      throw new Error('参考最低压力必须小于最大安全压力')
    }
    cached = { value: config, loadedAt: now }
    return config
  }
}
