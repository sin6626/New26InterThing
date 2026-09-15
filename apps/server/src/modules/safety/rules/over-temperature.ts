/**
 * 阅读导航：超温规则：入口或出口温度达到安全上限立即成立；两路温度都要检查。
 * 入口位置：modules/safety/rules/over-temperature.ts
 */

import type { SafetyConfig, SafetyReading } from '../types.js'

export const hasOverTemperature = (
  reading: SafetyReading,
  config: SafetyConfig,
) => (reading.inletTemperature !== null
    // 入口与出口任一路达到上限都成立；相等边界也属于超温。
    && reading.inletTemperature >= config.maxSafeTemperature)
  || (reading.outletTemperature !== null
    && reading.outletTemperature >= config.maxSafeTemperature)
