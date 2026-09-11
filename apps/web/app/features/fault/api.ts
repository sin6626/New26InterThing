import type {
  ApiResponse,
  FaultOptions,
  FaultQuery,
  FaultStatisticsItem,
  PaginatedFaults,
} from '@new26interthing/shared'

import { createHttpClient } from '~/utils/http'

type FaultFilters = Omit<FaultQuery, 'page' | 'pageSize'>

const unwrap = <T>(response: ApiResponse<T>) => {
  if (response.code !== 0 || response.data === null) throw new Error(response.message)
  return response.data
}

export const useFaultApi = () => {
  const config = useRuntimeConfig()
  const http = createHttpClient(config.public.apiBase)
  return {
    async getOptions() {
      const response = await http.get<ApiResponse<FaultOptions>>('/faults/options')
      return unwrap(response.data)
    },
    async getPage(query: FaultQuery) {
      const response = await http.get<ApiResponse<PaginatedFaults>>('/faults', { params: query })
      return unwrap(response.data)
    },
    async getStatistics(query: FaultFilters) {
      const response = await http.get<ApiResponse<FaultStatisticsItem[]>>('/faults/statistics', { params: query })
      return unwrap(response.data)
    },
  }
}
