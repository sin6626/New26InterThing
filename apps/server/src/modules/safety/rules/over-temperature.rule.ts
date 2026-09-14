import type { SafetyConfig, SafetyReading } from '../safety.types.js'

export const hasOverTemperature = (
  reading: SafetyReading,
  config: SafetyConfig,
) => (reading.inletTemperature !== null
    && reading.inletTemperature >= config.maxSafeTemperature)
  || (reading.outletTemperature !== null
    && reading.outletTemperature >= config.maxSafeTemperature)
