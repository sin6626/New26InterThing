/**
 * 阅读导航：低流规则：运行中低流须持续确认；冷却中流量骤降有更紧急的处理顺序。
 * 入口位置：modules/safety/rules/low-flow.ts
 * 这个
 */

import type { AutomationState } from '@new26interthing/shared'
import type { SafetyConfig, SafetyReading } from '../types.js'

/**
 * 判断冷却或故障散热期间是否发生需要立即停泵的低流。
 * @param reading 已经规范化的本次设备实时读数。
 * @param state 当前自动水循环状态。
 * @param config 已校验的安全保护配置。
 * @returns 散热阶段流量低于安全阈值时返回 true。
 */
export const hasImmediateCoolingLowFlow = (
  reading: SafetyReading,
  state: AutomationState,
  config: SafetyConfig,
) => (state === 'cooling' || state === 'fault')
  // 正在散热时失去水流不能再等完整低流确认窗口。
  && reading.flowRate !== null
  && reading.flowRate < config.minSafeFlow

/**
 * 判断普通运行期间的低流状态是否持续达到确认时间。
 * @param now 当前服务器时间戳，单位为毫秒。
 * @param lowFlowSince 本轮连续低流开始时间；没有低流时为空值。
 * @param config 已校验的安全保护配置。
 * @returns 连续低流达到确认窗口时返回 true。
 */
export const hasConfirmedLowFlow = (
  now: number,
  lowFlowSince: number | null,
  config: SafetyConfig,
) => lowFlowSince !== null
  // lowFlowSince 由监督器在首次低流时建立；读数恢复后清空并重新计时。
  && now - lowFlowSince >= config.lowFlowConfirmSeconds * 1_000
