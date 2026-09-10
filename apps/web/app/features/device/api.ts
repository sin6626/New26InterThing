import type { ApiResponse, DeviceListQuery, PaginatedDevices } from '@new26interthing/shared'

import { createHttpClient } from '~/utils/http'

export const useDeviceApi = () => {
  const config = useRuntimeConfig()
  const http = createHttpClient(config.public.apiBase)

  return {
    async listDevices(query: DeviceListQuery) {
      const response = await http.get<ApiResponse<PaginatedDevices>>('/devices', { params: query })
      return response.data.data
    },
  }
}
