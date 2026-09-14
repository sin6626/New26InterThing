export interface OperationalMetricsSnapshot {
  deviceNumber: string
  pumpRuntimeSeconds: number
  heaterRuntimeSeconds: number
  actualPump: 'on' | 'off' | 'unknown'
  actualHeater: 'on' | 'off' | 'unknown'
  outletHeatingRatePerMinute: number | null
  updatedAt: string | null
}

export interface OperationalMetricsRealtimeMessage {
  type: 'operational-metrics.realtime'
  data: OperationalMetricsSnapshot
}
