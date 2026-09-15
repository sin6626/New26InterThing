/**
 * 阅读导航：建流规则：泵启动后等待流量建立，超时才判故障；人工泵空转也有独立确认条件。
 * 入口位置：modules/safety/rules/build-flow.ts
 */

import type { SafetyContext } from '../types.js'

export const hasBuildFlowTimeout = (
  now: number,
  context: SafetyContext,
) => context.state === 'building-flow'
  // 建流起点是进入 building-flow 的时刻，不是当前 MQTT 包的采样时间。
  && context.stateEnteredAt !== undefined
  && now - context.stateEnteredAt >= context.config.buildFlowTimeoutSeconds * 1_000

export const hasPumpIdling = (
  now: number,
  context: SafetyContext,
  manualFlowEstablished: boolean,
  flowRate: number | null,
) => context.manualPumpStartedAt !== undefined
  // 人工开泵时允许同样的建流缓冲；若始终未建立安全流量才判空转。
  && context.manualPumpStartedAt !== null
  && !manualFlowEstablished
  && (flowRate ?? 0) < context.config.minSafeFlow
  && now - context.manualPumpStartedAt >= context.config.buildFlowTimeoutSeconds * 1_000
