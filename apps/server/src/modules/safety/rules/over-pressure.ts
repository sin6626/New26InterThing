/**
 * 阅读导航：超压规则：设备实际泵开启时，压力达到安全上限立即成立；设备保护不能等待页面确认。
 * 入口位置：modules/safety/rules/over-pressure.ts
 */

import type { SafetyConfig, SafetyReading } from '../types.js'
import { isValidSensorValue } from './sensor-value.js'

/**
 * 判断安全保护当前是否满足对应业务条件；本函数不主动执行外部操作。
 * @param reading 已经规范化的本次设备实时读数。
 * @param config 从后台配置读取并校验后的业务参数。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const hasOverPressure = (
  reading: SafetyReading,
  config: SafetyConfig,
) => reading.actualPump === 'on'
  // 只有设备实际泵运行时把压力读数当作运行超压；期望开泵不算实际运行。
  && reading.pressure !== null
  && isValidSensorValue(reading.pressure)
  && reading.pressure >= config.maxSafePressure
