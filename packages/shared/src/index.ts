export interface Device {
  id: number
  number: string | null
  deviceName: string
  remarks: string | null
  createdAt: string | null
}

export interface DeviceListQuery {
  page: number
  pageSize: number
  number?: string
  deviceName?: string
}

export interface PaginatedDevices {
  items: Device[]
  total: number
  page: number
  pageSize: number
}

export interface ApiSuccessResponse<T> {
  code: 0
  message: string
  data: T
}

export interface ApiErrorResponse {
  code: number
  message: string
  data: null
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
