import type { SafetyConfig, SafetyReading } from '../safety.types.js'

export const hasOverPressure = (
  reading: SafetyReading,
  config: SafetyConfig,
) => reading.actualPump === 'on'
  && reading.pressure !== null
  && reading.pressure >= config.maxSafePressure
