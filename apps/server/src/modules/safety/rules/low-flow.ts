import type { AutomationState } from '@new26interthing/shared'
import type { SafetyConfig, SafetyReading } from '../types.js'

export const hasImmediateCoolingLowFlow = (
  reading: SafetyReading,
  state: AutomationState,
  config: SafetyConfig,
) => (state === 'cooling' || state === 'fault')
  && reading.flowRate !== null
  && reading.flowRate < config.minSafeFlow

export const hasConfirmedLowFlow = (
  now: number,
  lowFlowSince: number | null,
  config: SafetyConfig,
) => lowFlowSince !== null
  && now - lowFlowSince >= config.lowFlowConfirmSeconds * 1_000
