import type {
  OperationLogOptions,
  OperationLogQuery,
  PaginatedOperationLogs,
} from '@new26interthing/shared'
import type { PoolConnection } from 'mysql2/promise'

export interface OperationEvent {
  source: 'application' | 'device' | 'recognition'
  triggerMode?: 'manual' | 'automatic' | null
  commandType: string
  deviceNumber?: string | null
  configId?: number | null
  commandName?: string | null
  oldValue?: string | null
  newValue?: string | null
  result: 'success' | 'failed'
  relatedId?: number | null
}

export interface OperationHistoryRepository {
  record(event: OperationEvent, connection?: PoolConnection): Promise<void>
  getLogOptions(): Promise<OperationLogOptions>
  listLogs(query: OperationLogQuery): Promise<Omit<PaginatedOperationLogs, 'page' | 'pageSize'>>
}
