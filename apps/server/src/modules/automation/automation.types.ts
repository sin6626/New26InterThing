import type { ActuatorValue } from '@new26interthing/shared'

import type { PidConfig } from './temperature-controller.js'

export interface AutomationConfig {
  strategy: 'hysteresis' | 'pid'
  targetTemperature: number
  temperatureHysteresis: number
  minSafeFlow: number
  buildFlowTimeoutSeconds: number
  coolingDelaySeconds: number
  dataTimeoutSeconds: number
  lowFlowConfirmSeconds: number
  maxSafePressure: number
  maxSafeTemperature: number
  temperatureReversedConfirmSeconds: number
  dryHeatingTimeoutSeconds: number
  dryHeatingTemperatureDifference: number
  pid: PidConfig
}

export interface AutomationReading {
  recordedAt: number
  flowRate: number | null
  pressure?: number | null
  inletTemperature?: number | null
  outletTemperature: number | null
  actualPump: ActuatorValue | 'unknown'
  actualHeater: ActuatorValue | 'unknown'
}

export class AutomationError extends Error {
  constructor(
    message: string,
    readonly status = 409,
    readonly code = 'AUTOMATION_CONFLICT',
  ) {
    super(message)
  }
}
