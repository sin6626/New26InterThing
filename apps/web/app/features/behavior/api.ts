import type { ApiResponse, BehaviorOptions, BehaviorQuery, PaginatedBehaviors, RecognitionResult } from '@new26interthing/shared'

import { createHttpClient } from '~/utils/http'

const unwrap = <T>(response: ApiResponse<T>) => {
  if (response.code !== 0 || response.data === null) throw new Error(response.message)
  return response.data
}

export const useBehaviorApi = () => {
  const http = createHttpClient(useRuntimeConfig().public.apiBase)
  return {
    async getOptions() { return unwrap((await http.get<ApiResponse<BehaviorOptions>>('/behaviors/options')).data) },
    async getPage(query: BehaviorQuery) { return unwrap((await http.get<ApiResponse<PaginatedBehaviors>>('/behaviors', { params: query })).data) },
    async recognize(rowIds: number[]) { return unwrap((await http.post<ApiResponse<RecognitionResult>>('/behaviors/recognize', { rowIds })).data) },
  }
}
