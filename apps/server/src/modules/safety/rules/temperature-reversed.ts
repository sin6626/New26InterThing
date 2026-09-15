/**
 * 阅读导航：探头装反确认规则：入口温度持续高于出口温度达到配置时间才锁故障；相等属于正常边界。
 * 入口位置：modules/safety/rules/temperature-reversed.ts
 */

import type { SafetyConfig } from '../types.js'

export const hasConfirmedReversedTemperature = (
  now: number,
  reversedSince: number | null,
  config: SafetyConfig,
) => reversedSince !== null
  // 入口>出口的起点由监督器设置；这里仅判断连续时间是否到达后台确认秒数。
  && now - reversedSince >= config.temperatureReversedConfirmSeconds * 1_000
