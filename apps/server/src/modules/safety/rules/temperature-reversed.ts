/**
 * 阅读导航：探头装反确认规则：用温差死区累计异常证据，避免单包抖动把确认进度清零。
 * 入口位置：modules/safety/rules/temperature-reversed.ts
 */

import type { SafetyConfig } from '../types.js'

export const hasConfirmedReversedTemperature = (
  evidenceMilliseconds: number,
  config: SafetyConfig,
) => evidenceMilliseconds >= config.temperatureReversedConfirmSeconds * 1_000

export const accumulateReversedTemperatureEvidence = (
  evidenceMilliseconds: number,
  elapsedMilliseconds: number,
  inletTemperature: number,
  outletTemperature: number,
) => {
  const difference = inletTemperature - outletTemperature
  // 入口至少高 0.3℃才累计；-0.1℃～0.3℃属于传感器抖动死区，保留已有进度。
  if (difference >= 0.3) return evidenceMilliseconds + elapsedMilliseconds
  // 出口明确高于入口后，以两倍速度消退旧证据，短暂恢复不会立刻清零。
  if (difference < -0.1) {
    return Math.max(0, evidenceMilliseconds - elapsedMilliseconds * 2)
  }
  return evidenceMilliseconds
}
