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
  pid: PidConfig
}

export interface AutomationReading {
  recordedAt: number
  flowRate: number | null
  outletTemperature: number | null
  actualPump: ActuatorValue | 'unknown'
  actualHeater: ActuatorValue | 'unknown'
}
