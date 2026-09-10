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

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
}
