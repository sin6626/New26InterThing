import type { FaultItem } from './fault.js'
import type {
  AutomationStatusMessage,
  WaterFlowRealtimeMessage,
} from './automation.js'

export interface SensorRealtimeData {
  deviceNumber: string
  recordedAt: string
  fields: Record<string, string | number | null>
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
  | SystemStatusMessage
  | FaultAlertMessage
  | AutomationStatusMessage
  | WaterFlowRealtimeMessage
