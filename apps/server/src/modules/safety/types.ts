/**
 * 阅读导航：安全事实与决定类型：区分实际设备反馈、期望动作、传感器值、保护结论和复位授权；类型关系决定安全输入边界。
 * 入口位置：modules/safety/types.ts
 */

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

export type SafetyActionSource = 'manual' | 'automation'

export interface SafetyDecision {
  faultCode: SafetyFaultCode
  detail: string
  closeHeater: boolean
  stopPump: boolean
}
