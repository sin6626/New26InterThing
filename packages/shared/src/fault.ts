export type FaultSource = 'system' | 'intelligence'

export interface FaultItem {
  id: number
  deviceNumber: string | null
  errorNumber: string | null
  type: string | null
  source: FaultSource
  message: string | null
  occurredAt: string | null
}

export interface FaultTypeOption {
  value: string
  label: string
}

export interface FaultOptions {
  deviceNumbers: string[]
  types: FaultTypeOption[]
  sources: Array<{ value: FaultSource, label: string }>
}

export interface FaultQuery {
  page: number
  pageSize: number
  deviceNumber?: string
  type?: string
  source?: FaultSource
  startTime?: string
  endTime?: string
}

export interface PaginatedFaults {
  items: FaultItem[]
  total: number
  page: number
  pageSize: number
}

export interface FaultStatisticsItem {
  type: string | null
  label: string
  count: number
}
