/**
 * 阅读导航：故障码类型目录：安全与水力诊断的错误语义映射到后台 type；不在判断规则中散落数据库数字。
 * 入口位置：modules/safety/faults/catalog.ts
 */

import type {
  HydraulicDiagnosisCode,
  SafetyFaultCode,
} from '@new26interthing/shared'

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

const hydraulicFaultTypes: Partial<Record<HydraulicDiagnosisCode, string>> = {
  HYDRAULIC_BLOCKAGE: '6',
  HYDRAULIC_PUMP_ABNORMAL: '6',
  HYDRAULIC_SENSOR_ANOMALY: '3',
  HYDRAULIC_LEAK_OR_BURST: '6',
}

export const getHydraulicFaultType = (faultCode: HydraulicDiagnosisCode) => {
  const type = hydraulicFaultTypes[faultCode]
  if (!type) throw new Error(`水力诊断 ${faultCode} 没有故障类型映射`)
  return type
}
