import type { SafetyFaultCode } from '@new26interthing/shared'

const faultTypes: Record<SafetyFaultCode, string> = {
  CONTROL_CONFIG_INVALID: '6',
  BUILD_FLOW_TIMEOUT: '6',
  COMMAND_PUBLISH_FAILED: '2',
  LOW_FLOW: '6',
  PUMP_IDLING: '6',
  OVER_PRESSURE: '6',
  OVER_TEMPERATURE: '6',
  SENSOR_FLOW_TIMEOUT: '3',
  SENSOR_PRESSURE_TIMEOUT: '3',
  SENSOR_TEMPERATURE_TIMEOUT: '3',
  TEMP_SENSOR_REVERSED: '3',
  DRY_HEATING_NO_TEMP_RISE: '6',
}

export const getSafetyFaultType = (faultCode: SafetyFaultCode) => (
  faultTypes[faultCode]
)
