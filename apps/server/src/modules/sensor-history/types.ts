/**
 * 阅读导航：历史查询仓储接口：描述选项、分页和趋势三项能力；HTTP 路由不直接操作数据库连接。
 * 入口位置：modules/sensor-history/types.ts
 */

import type {
  PaginatedSensorHistory,
  SensorHistoryOptions,
  SensorHistoryQuery,
  SensorHistoryTrend,
} from '@new26interthing/shared'

export interface SensorHistoryRepository {
  getOptions(): Promise<SensorHistoryOptions>
  list(query: SensorHistoryQuery): Promise<Pick<PaginatedSensorHistory, 'items' | 'total'>>
  getTrend(query: Omit<SensorHistoryQuery, 'page' | 'pageSize'> & { limit: number }): Promise<SensorHistoryTrend>
}
