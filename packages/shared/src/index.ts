export interface Device {
  id: number
  number: string | null
  deviceName: string
  remarks: string | null
  createdAt: string | null
}

export interface DeviceListQuery {
  page: number
  pageSize: number
  number?: string
  deviceName?: string
}

export interface PaginatedDevices {
  items: Device[]
  total: number
  page: number
  pageSize: number
}

export interface ApiSuccessResponse<T> {
  code: 0
  message: string
  data: T
}

export interface ApiErrorResponse {
  code: number
  message: string
  data: null
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

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

export type RealtimeMessage = SensorRealtimeMessage | SystemStatusMessage | FaultAlertMessage

export interface SensorHistoryField {
  key: string
  label: string
  unit: string
  type: 'number' | 'string'
}

export interface SensorHistoryItem {
  id: number
  deviceNumber: string | null
  fields: Record<string, string | number | null>
  status: 'normal' | 'alarm'
  statusCode: number
  online: string | null
  recordedAt: string | null
}

export interface SensorHistoryOptions {
  deviceNumbers: string[]
  fields: SensorHistoryField[]
}

export interface SensorHistoryQuery {
  page: number
  pageSize: number
  deviceNumber?: string
  startTime?: string
  endTime?: string
  status?: 'all' | 'normal' | 'abnormal'
}

export interface PaginatedSensorHistory {
  items: SensorHistoryItem[]
  total: number
  page: number
  pageSize: number
}

export interface SensorHistoryTrendSeries {
  key: string
  name: string
  unit: string
  data: Array<number | null>
}

export interface SensorHistoryTrend {
  times: string[]
  series: SensorHistoryTrendSeries[]
}

export interface FaultItem {
  id: number
  deviceNumber: string | null
  errorNumber: string | null
  type: string | null
  message: string | null
  occurredAt: string | null
}

export interface FaultTypeOption {
  value: string
  label: string
}

export interface FaultOptions {
  deviceNumbers: string[]
  types: FaultTypeOption[]
}

export interface FaultQuery {
  page: number
  pageSize: number
  deviceNumber?: string
  type?: string
  startTime?: string
  endTime?: string
}

export interface PaginatedFaults {
  items: FaultItem[]
  total: number
  page: number
  pageSize: number
}

export interface FaultStatisticsItem {
  type: string | null
  label: string
  count: number
}

export interface RecognitionRequest { rowIds: number[] }

export interface RecognitionResult {
  saved: boolean
  selectedCount: number
  behaviorId: number
  message: string
}

export interface BehaviorField {
  key: string
  label: string
  unit: string
  type: 'number' | 'string'
}

export interface BehaviorItem {
  id: number
  deviceNumber: string | null
  fields: Record<string, string | number | null>
  recordedAt: string | null
}

export interface BehaviorOptions {
  fields: BehaviorField[]
}

export interface BehaviorQuery {
  page: number
  pageSize: number
  startTime?: string
  endTime?: string
}

export interface PaginatedBehaviors {
  items: BehaviorItem[]
  total: number
  page: number
  pageSize: number
}
