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
