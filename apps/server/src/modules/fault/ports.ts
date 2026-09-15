/**
 * 阅读导航：故障仓储接口：描述故障记录、映射和查询能力；测试可替换真实 MySQL，业务流程不必知道 SQL 细节。
 * 入口位置：modules/fault/ports.ts
 */

import type {
  FaultItem,
  FaultOptions,
  FaultQuery,
  FaultStatisticsItem,
  PaginatedFaults,
} from '@new26interthing/shared'

export interface NewFaultRecord {
  deviceNumber: string
  errorNumber: string
  type: string
  message: string
  occurredAt: string | Date
}

export interface FaultRepository {
  findMappedMessage(errorNumber: string, type: string): Promise<string | null>
  save(record: NewFaultRecord): Promise<FaultItem>
  getOptions(): Promise<FaultOptions>
  list(query: FaultQuery): Promise<Pick<PaginatedFaults, 'items' | 'total'>>
  getStatistics(query: Omit<FaultQuery, 'page' | 'pageSize'>): Promise<FaultStatisticsItem[]>
}
