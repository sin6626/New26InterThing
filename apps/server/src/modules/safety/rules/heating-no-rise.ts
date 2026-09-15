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
  && effectiveHeatingMilliseconds + (
    lastEffectiveHeatingAt === null ? 0 : now - lastEffectiveHeatingAt
  ) >= config.dryHeatingTimeoutSeconds * 1_000
  && (outletTemperature ?? heatingBaseline) - heatingBaseline
    < config.dryHeatingTemperatureDifference
