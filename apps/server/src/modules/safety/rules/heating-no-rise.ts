/**
 * 阅读导航：无温升规则：只累计有效加热时间，出口温度不达到后台温差要求时判干烧疑似故障。
 * 入口位置：modules/safety/rules/heating-no-rise.ts
 */

import type { SafetyConfig } from '../types.js'

export const hasHeatingNoRise = ({
  now,
  heatingBaseline,
  outletTemperature,
  effectiveHeatingMilliseconds,
  lastEffectiveHeatingAt,
  config,
}: {
  now: number
  heatingBaseline: number | null
  outletTemperature: number | null
  effectiveHeatingMilliseconds: number
  lastEffectiveHeatingAt: number | null
  config: SafetyConfig
}) => heatingBaseline !== null
  // baseline 是本轮有效加热开始时的出口温度；没有基线就不能判断“升了多少”。
  && effectiveHeatingMilliseconds + (
    // 上次有效加热时间到 now 的片段在此补算，停热阶段不累计。
    lastEffectiveHeatingAt === null ? 0 : now - lastEffectiveHeatingAt
  ) >= config.dryHeatingTimeoutSeconds * 1_000
  && (outletTemperature ?? heatingBaseline) - heatingBaseline
    // 加热足够久但出口温升仍低于后台阈值，才认为疑似无温升干烧。
    < config.dryHeatingTemperatureDifference
