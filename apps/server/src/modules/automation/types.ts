/**
 * 阅读导航：自动控制事实类型：配置、规范化读数和可返回给 HTTP 的错误；类型字段体现状态机需要哪些数据，不在这里执行规则。
 * 入口位置：modules/automation/types.ts
 */

import type { ActuatorValue } from '@new26interthing/shared'

import type { PidConfig } from './rules/temperature.js'

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

export interface AutomationConfigLoadOptions {
  allowUnsafeBusinessValues?: boolean
}

export interface AutomationReading {
  recordedAt: number
  flowRate: number | null
  pressure: number | null
  inletTemperature: number | null
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
