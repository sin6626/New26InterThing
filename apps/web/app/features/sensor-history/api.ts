import type {
  ApiResponse,
  PaginatedSensorHistory,
  SensorHistoryOptions,
  SensorHistoryQuery,
  SensorHistoryTrend,
} from '@new26interthing/shared'

import { createHttpClient } from '~/utils/http'

type HistoryFilters = Omit<SensorHistoryQuery, 'page' | 'pageSize'>

const unwrap = <T>(response: ApiResponse<T>) => {
  if (response.code !== 0 || response.data === null) throw new Error(response.message)
  return response.data
}

export const useSensorHistoryApi = () => {
  const config = useRuntimeConfig()
  const http = createHttpClient(config.public.apiBase)

  return {
    async getOptions() {
      const response = await http.get<ApiResponse<SensorHistoryOptions>>('/sensor-history/options')
      return unwrap(response.data)
    },
    async getPage(query: SensorHistoryQuery) {
      const response = await http.get<ApiResponse<PaginatedSensorHistory>>('/sensor-history', { params: query })
      return unwrap(response.data)
    },
    async getTrend(query: HistoryFilters & { limit: number }) {
      const response = await http.get<ApiResponse<SensorHistoryTrend>>('/sensor-history/trend', { params: query })
      return unwrap(response.data)
    },
  }
}
