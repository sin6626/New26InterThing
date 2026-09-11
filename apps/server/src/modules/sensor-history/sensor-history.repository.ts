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
