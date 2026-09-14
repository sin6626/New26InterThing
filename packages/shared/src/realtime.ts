import type { FaultItem } from './fault.js'
import type {
  AutomationStatusMessage,
  WaterFlowRealtimeMessage,
} from './automation.js'

export interface SensorRealtimeData {
  deviceNumber: string
  recordedAt: string
  dataKind: 'realtime' | 'backfill'
  fields: Record<string, string | number | null>
}

export interface DevicePresence {
  deviceNumber: string
  status: 'online' | 'offline'
  lastSeenAt: string | null
}

export interface DevicePresenceMessage {
  type: 'device.presence'
  data: DevicePresence
}

export type HydraulicDiagnosisCode =
  | 'STOPPED'
  | 'BUILDING_FLOW'
  | 'SENSOR_INVALID'
  | 'HYDRAULIC_NORMAL'
  | 'HYDRAULIC_BLOCKAGE'
  | 'HYDRAULIC_PUMP_ABNORMAL'
  | 'HYDRAULIC_SENSOR_ANOMALY'
  | 'HYDRAULIC_LEAK_OR_BURST'

export interface HydraulicDiagnosis {
  deviceNumber: string
  code: HydraulicDiagnosisCode
  name: string
  detail: string
  level: 'info' | 'success' | 'warning' | 'error'
}

export interface HydraulicDiagnosisMessage {
  type: 'hydraulic.diagnosis'
  data: HydraulicDiagnosis
}

export interface SensorRealtimeMessage {
  type: 'sensor.realtime'
  data: SensorRealtimeData
}

export interface SystemStatusMessage {
  type: 'system.status'
  data: {
    mqttConnected: boolean
  }
}

export interface FaultAlertMessage {
  type: 'fault.alert'
  data: FaultItem
}

export type RealtimeMessage =
  | SensorRealtimeMessage
  | DevicePresenceMessage
  | HydraulicDiagnosisMessage
  | SystemStatusMessage
  | FaultAlertMessage
  | AutomationStatusMessage
  | WaterFlowRealtimeMessage
