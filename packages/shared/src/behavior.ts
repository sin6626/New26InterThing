export interface RecognitionRequest { rowIds: number[] }
export interface RecognitionResult { saved: boolean; selectedCount: number; behaviorId: number; message: string }
export interface BehaviorField { key: string; label: string; unit: string; type: 'number' | 'string' }
export interface BehaviorItem { id: number; deviceNumber: string | null; fields: Record<string, string | number | null>; recordedAt: string | null }
export interface BehaviorOptions { fields: BehaviorField[] }
export interface BehaviorQuery { page: number; pageSize: number; startTime?: string; endTime?: string }
export interface PaginatedBehaviors { items: BehaviorItem[]; total: number; page: number; pageSize: number }
