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

export interface SensorHistoryOperationalMetricsQuery {
  deviceNumber: string
  startTime?: string
  endTime?: string
}

export interface SensorHistoryOperationalMetrics {
  deviceNumber: string
  startTime: string | null
  endTime: string | null
  pumpRuntimeSeconds: number
  heaterRuntimeSeconds: number
  outletTemperatureRate: {
    times: string[]
    data: Array<number | null>
  }
}
