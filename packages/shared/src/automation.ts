export type AutomationState =
  | 'stopped'
  | 'building-flow'
  | 'running'
  | 'cooling'

export type ActuatorValue = 'on' | 'off'

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
