import type { SafetyFaultCode } from '../safety.types.js'

export const getSensorTimeoutFault = ({
  active,
  pressureFresh,
  flowFresh,
  inletTemperatureFresh,
  outletTemperatureFresh,
}: {
  active: boolean
  pressureFresh: boolean
  flowFresh: boolean
  inletTemperatureFresh: boolean
  outletTemperatureFresh: boolean
}): SafetyFaultCode | null => {
  if (!active) return null
  if (!pressureFresh) return 'SENSOR_PRESSURE_TIMEOUT'
  if (!flowFresh) return 'SENSOR_FLOW_TIMEOUT'
  if (!inletTemperatureFresh || !outletTemperatureFresh) {
    return 'SENSOR_TEMPERATURE_TIMEOUT'
  }
  return null
}
