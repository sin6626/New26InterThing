/**
 * 阅读导航：低流规则：运行中低流须持续确认；冷却中流量骤降有更紧急的处理顺序。
 * 入口位置：modules/safety/rules/low-flow.ts
 */

import type { AutomationState } from '@new26interthing/shared'
import type { SafetyConfig, SafetyReading } from '../types.js'

export const hasImmediateCoolingLowFlow = (
  reading: SafetyReading,
  state: AutomationState,
  config: SafetyConfig,
) => (state === 'cooling' || state === 'fault')
  // 正在散热时失去水流不能再等完整低流确认窗口。
  && reading.flowRate !== null
  && reading.flowRate < config.minSafeFlow

export const hasConfirmedLowFlow = (
  now: number,
  lowFlowSince: number | null,
  config: SafetyConfig,
) => lowFlowSince !== null
  // lowFlowSince 由监督器在首次低流时建立；读数恢复后清空并重新计时。
  && now - lowFlowSince >= config.lowFlowConfirmSeconds * 1_000
