/**
 * 阅读导航：超压规则：设备实际泵开启时，压力达到安全上限立即成立；设备保护不能等待页面确认。
 * 入口位置：modules/safety/rules/over-pressure.ts
 */

import type { SafetyConfig, SafetyReading } from '../types.js'

export const hasOverPressure = (
  reading: SafetyReading,
  config: SafetyConfig,
) => reading.actualPump === 'on'
  // 只有设备实际泵运行时把压力读数当作运行超压；期望开泵不算实际运行。
  && reading.pressure !== null
  && reading.pressure >= config.maxSafePressure
