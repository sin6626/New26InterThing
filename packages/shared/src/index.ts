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

export type RealtimeMessage = SensorRealtimeMessage | SystemStatusMessage

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
  status: number
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
