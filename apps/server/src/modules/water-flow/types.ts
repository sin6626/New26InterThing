export interface PersistedWaterFlow {
  totalVolumeLiters: number
  lastFlowRateLitersPerMinute: number
  lastCalculatedAt: number
}

export interface WaterFlowRepository {
  load(deviceNumber: string): Promise<PersistedWaterFlow | null>
  save(deviceNumber: string, state: PersistedWaterFlow): Promise<void>
  reset(deviceNumber: string, oldVolumeLiters: number): Promise<void>
}
