/**
 * 阅读导航：设备读数适配：把 MQTT 上行字段转为自动控制统一读数；temp_out/field2 是出口温度，temp_in/field3 是入口温度。
 * 入口位置：modules/automation/adapters/reading.ts
 * 
 */

import type { AutomationReading } from '../types.js'

type SensorValues = Record<string, string | number | null>

/**
 * 把设备字段安全转换为有限数字，并区分字段缺失与值非法。
 * @param value 本次准备读取、转换或保存的值。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const numeric = (value: unknown) => {
  if (value === null || value === undefined) return null
  if (typeof value === 'string' && value.trim() === '') return Number.NaN
  const parsed = Number(value)
  // isFinite判断一个值是不是有限的, 也就是说判断不是infinity
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

/**
 * 把设备上报的 0/1 或 on/off 统一转换为执行器状态。
 * @param value 本次准备读取、转换或保存的值。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const actuator = (value: unknown) => {
  if (value === 'on' || value === 1 || value === '1') return 'on' as const
  if (value === 'off' || value === 0 || value === '0') return 'off' as const
  return 'unknown' as const
}

/**
 * 按照已确认字段映射把 MQTT 上行值转换成自动控制统一读数。
 * @param values 设备上报或数据库读取到的字段值集合。
 * @param recordedAt 本次读数的服务器接收时间戳，单位为毫秒。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const normalizeAutomationReading = (
  values: SensorValues,
  recordedAt: number,
): AutomationReading => ({
  recordedAt,
  pressure: numeric(values.pressure ?? values.field4),
  outletTemperature: numeric(values.temp_out ?? values.field2),
  inletTemperature: numeric(values.temp_in ?? values.field3),
  flowRate: numeric(values.flow_rate ?? values.field5),
  actualHeater: actuator(values.heat_Y1 ?? values.field6),
  actualPump: actuator(values.water_Y2 ?? values.field7),
})
