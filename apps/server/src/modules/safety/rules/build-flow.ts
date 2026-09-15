import type { SafetyContext } from '../types.js'

export const hasBuildFlowTimeout = (
  now: number,
  context: SafetyContext,
) => context.state === 'building-flow'
  && context.stateEnteredAt !== undefined
  && now - context.stateEnteredAt >= context.config.buildFlowTimeoutSeconds * 1_000

export const hasPumpIdling = (
  now: number,
  context: SafetyContext,
  manualFlowEstablished: boolean,
  flowRate: number | null,
) => context.manualPumpStartedAt !== undefined
  && context.manualPumpStartedAt !== null
  && !manualFlowEstablished
  && (flowRate ?? 0) < context.config.minSafeFlow
  && now - context.manualPumpStartedAt >= context.config.buildFlowTimeoutSeconds * 1_000
