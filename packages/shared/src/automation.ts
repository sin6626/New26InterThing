export type AutomationState =
  | 'stopped'
  | 'building-flow'
  | 'running'
  | 'cooling'
  | 'fault'

export type ActuatorValue = 'on' | 'off'

export interface AutomationDebugMode {
  enabled: boolean
}

export interface PidSnapshot {
  outputPercent: number
  plannedDutyPercent: number
  windowRemainingSeconds: number
  desired: ActuatorValue
  limitationReason: string | null
}

export interface WaterFlowSnapshot {
  deviceNumber: string
  flowRateLitersPerMinute: number
  averageFlowOneMinute: number
  flowVelocityMetersPerSecond: number | null
  velocityStatus: 'ok' | 'unconfigured'
  pipeInnerDiameterMillimeters: number | null
  totalVolumeLiters: number
  updatedAt: string | null
}

export type SafetyFaultCode =
  | 'CONTROL_CONFIG_INVALID'
  | 'BUILD_FLOW_TIMEOUT'
  | 'COMMAND_PUBLISH_FAILED'
  | 'LOW_FLOW'
  | 'PUMP_IDLING'
  | 'OVER_PRESSURE'
  | 'OVER_TEMPERATURE'
  | 'SENSOR_FLOW_TIMEOUT'
  | 'SENSOR_PRESSURE_TIMEOUT'
  | 'SENSOR_TEMPERATURE_TIMEOUT'
  | 'TEMP_SENSOR_REVERSED'
  | 'DRY_HEATING_NO_TEMP_RISE'

export type SensorSafetyStatus = 'unknown' | 'ok' | 'invalid' | 'timeout'

export interface SafetySnapshot {
  locked: boolean
  faultCode: SafetyFaultCode | null
  detail: string | null
  occurredAt: string | null
  resetAllowed: boolean
  resetReason: string | null
  faultRecorded: boolean
  faultRecordError: string | null
  protection: {
    closeHeater: boolean
    stopPump: boolean
  } | null
  sensors: {
    flow: SensorSafetyStatus
    pressure: SensorSafetyStatus
    inletTemperature: SensorSafetyStatus
    outletTemperature: SensorSafetyStatus
  }
}

export interface AutomationSnapshot {
  deviceNumber: string
  enabled: boolean
  state: AutomationState
  desiredPump: ActuatorValue
  desiredHeater: ActuatorValue
  actualPump: ActuatorValue | 'unknown'
  actualHeater: ActuatorValue | 'unknown'
  countdownSeconds: number | null
  temperatureStrategy: 'hysteresis' | 'pid' | null
  targetTemperature: number | null
  outletTemperature: number | null
  pid: PidSnapshot | null
  limitationReason: string | null
  lastAction: {
    topic: 'pump' | 'heater'
    value: ActuatorValue
    status: 'published' | 'blocked' | 'failed'
    message: string
  } | null
  safety: SafetySnapshot
  waterFlow: WaterFlowSnapshot
}

export interface AutomationStatusMessage {
  type: 'automation.status'
  data: AutomationSnapshot
}

export interface WaterFlowRealtimeMessage {
  type: 'water-flow.realtime'
  data: WaterFlowSnapshot
}
