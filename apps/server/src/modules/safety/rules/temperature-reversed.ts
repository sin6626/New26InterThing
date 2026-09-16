/**
 * 阅读导航：探头装反确认规则：用温差死区累计异常证据，避免单包抖动把确认进度清零。
 * 入口位置：modules/safety/rules/temperature-reversed.ts
 */

import type { SafetyConfig } from '../types.js'

/**
 * 判断安全保护当前是否满足对应业务条件；本函数不主动执行外部操作。
 * @param evidenceMilliseconds 当前累计的装反异常证据，单位为毫秒。
 * @param config 从后台配置读取并校验后的业务参数。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const hasConfirmedReversedTemperature = (
  evidenceMilliseconds: number,
  config: SafetyConfig,
) => evidenceMilliseconds >= config.temperatureReversedConfirmSeconds * 1_000

/**
 * 按照 0.3℃ 异常阈值和恢复死区累计或消退探头装反证据。
 * @param evidenceMilliseconds 当前累计的装反异常证据，单位为毫秒。
 * @param elapsedMilliseconds 距离上次有效观察经过的毫秒数。
 * @param inletTemperature 本次读数中的入口温度。
 * @param outletTemperature 本次读数中的出口温度，缺失时为空值。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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
