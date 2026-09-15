/**
 * 阅读导航：水量持久化接口与状态类型：区分累计值、上次流量和更新时间，供进程内计算与数据库适配共用。
 * 入口位置：modules/water-flow/types.ts
 */

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
