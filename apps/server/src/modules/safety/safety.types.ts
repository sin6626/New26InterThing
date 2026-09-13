import type {
  ActuatorValue,
  AutomationState,
  SafetyFaultCode,
  SafetySnapshot,
} from '@new26interthing/shared'

export type {
  SafetyFaultCode,
  SafetySnapshot,
} from '@new26interthing/shared'

export interface SafetyConfig {
  minSafeFlow: number
  maxSafePressure: number
  maxSafeTemperature: number
  dataTimeoutSeconds: number
  lowFlowConfirmSeconds: number
  buildFlowTimeoutSeconds: number
  temperatureReversedConfirmSeconds: number
  dryHeatingTimeoutSeconds: number
  dryHeatingTemperatureDifference: number
}

export interface SafetyReading {
  recordedAt: number
  flowRate: number | null
  pressure: number | null
  inletTemperature: number | null
  outletTemperature: number | null
  actualPump: ActuatorValue | 'unknown'
  actualHeater: ActuatorValue | 'unknown'
}

export interface SafetyContext {
  state: AutomationState
  stateEnteredAt?: number
  manualPumpStartedAt?: number | null
  desiredPump: ActuatorValue
  desiredHeater: ActuatorValue
  config: SafetyConfig
}

export interface SafetyAction {
  topic: 'pump' | 'heater'
  value: ActuatorValue
}

export interface SafetyAuthorization {
  allowed: boolean
  reason: string | null
}

export interface SafetyDecision {
  faultCode: SafetyFaultCode
  detail: string
  closeHeater: boolean
  stopPump: boolean
}
