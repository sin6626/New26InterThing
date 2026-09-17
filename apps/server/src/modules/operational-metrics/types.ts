export type OperationalSwitchState = 'on' | 'off' | 'unknown'

export interface PersistedOperationalMetrics {
  pumpRuntimeSeconds: number
  heaterRuntimeSeconds: number
  lastCalculatedAt: number
  lastPumpState: OperationalSwitchState
  lastHeaterState: OperationalSwitchState
}

export interface OperationalMetricsRepository {
  load(deviceNumber: string): Promise<PersistedOperationalMetrics | null>
  save(deviceNumber: string, state: PersistedOperationalMetrics): Promise<void>
  reset(
    deviceNumber: string,
    oldPumpRuntimeSeconds: number,
    oldHeaterRuntimeSeconds: number,
  ): Promise<void>
}
