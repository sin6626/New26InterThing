/**
 * 阅读导航：行为模块接口类型：历史识别输入与仓储能力；字段列由后台数据库映射决定，不写死赛方结果字段。
 * 入口位置：modules/behavior/types.ts
 */

import type { BehaviorOptions, BehaviorQuery, PaginatedBehaviors } from '@new26interthing/shared'

export interface RecognitionInputRow {
  deviceNumber: string | null
  recordedAt: string | null
  [field: string]: string | number | null
}

export interface BehaviorRepository {
  getOptions(): Promise<BehaviorOptions>
  list(query: BehaviorQuery): Promise<Pick<PaginatedBehaviors, 'items' | 'total'>>
  getRecognitionRows(rowIds: number[]): Promise<RecognitionInputRow[]>
  saveRecognitionResult(result: Record<string, unknown>, deviceNumber: string | null): Promise<number>
}
