import type { SafetyConfig } from '../types.js'

export const hasConfirmedReversedTemperature = (
  now: number,
  reversedSince: number | null,
  config: SafetyConfig,
) => reversedSince !== null
  && now - reversedSince >= config.temperatureReversedConfirmSeconds * 1_000
