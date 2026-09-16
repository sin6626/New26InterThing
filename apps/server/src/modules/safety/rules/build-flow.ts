/**
 * 阅读导航：建流规则：泵启动后等待流量建立，超时才判故障；人工泵空转也有独立确认条件。
 * 入口位置：modules/safety/rules/build-flow.ts
 */

import type { SafetyContext } from '../types.js'

/**
 * 判断自动状态机是否在建流阶段等待超时。
 * @param now 当前服务器时间戳，单位为毫秒。
 * @param context 当前自动状态和安全配置组成的判断上下文。
 * @returns 达到建流超时时间时返回 true。
 */
export const hasBuildFlowTimeout = (
  now: number,
  context: SafetyContext,
) => context.state === 'building-flow'
  // 建流起点是进入 building-flow 的时刻，不是当前 MQTT 包的采样时间。
  && context.stateEnteredAt !== undefined
  && now - context.stateEnteredAt >= context.config.buildFlowTimeoutSeconds * 1_000

/**
 * 判断人工开泵后是否始终没有建立安全流量。
 * @param now 当前服务器时间戳，单位为毫秒。
 * @param context 当前人工开泵时间和安全配置组成的判断上下文。
 * @param manualFlowEstablished 本轮人工开泵是否曾经达到安全流量。
 * @param flowRate 当前流量读数，缺失时按照未建流处理。
 * @returns 人工建流等待超时时返回 true。
 */
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
