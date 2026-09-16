/**
 * 阅读导航：超温规则：入口或出口温度达到安全上限立即成立；两路温度都要检查。
 * 入口位置：modules/safety/rules/over-temperature.ts
 */

import type { SafetyConfig, SafetyReading } from '../types.js'
import { isValidSensorValue } from './sensor-value.js'

/**
 * 判断安全保护当前是否满足对应业务条件；本函数不主动执行外部操作。
 * @param reading 已经规范化的本次设备实时读数。
 * @param config 从后台配置读取并校验后的业务参数。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const hasOverTemperature = (
  reading: SafetyReading,
  config: SafetyConfig,
) => (reading.inletTemperature !== null
    && isValidSensorValue(reading.inletTemperature)
    // 入口与出口任一路达到上限都成立；相等边界也属于超温。
    && reading.inletTemperature >= config.maxSafeTemperature)
  || (reading.outletTemperature !== null
    && isValidSensorValue(reading.outletTemperature)
    && reading.outletTemperature >= config.maxSafeTemperature)
