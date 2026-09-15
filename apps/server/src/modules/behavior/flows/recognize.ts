import type { RecognitionResult } from '@new26interthing/shared'

import type { BehaviorRepository } from '../types.js'
import { createRecognitionAdapter, type RecognitionAdapter } from '../adapters/recognition.http.js'

export interface RecognitionService { recognize(rowIds: number[]): Promise<RecognitionResult> }

/** 读取选中历史数据、调用赛方适配器，再按动态字段映射保存识别结果。 */
export const createRecognitionService = (repository: BehaviorRepository, adapter: RecognitionAdapter = createRecognitionAdapter()): RecognitionService => ({
  async recognize(rowIds) {
    const rows = await repository.getRecognitionRows(rowIds)
    if (rows.length !== rowIds.length) throw new Error('部分历史数据不存在，请刷新页面后重新选择')
    const deviceNumbers = new Set(rows.map(row => row.deviceNumber).filter(Boolean))
    if (deviceNumbers.size > 1) throw new Error('一次智能识别只能选择同一设备的历史数据')
    const result = await adapter.recognize(rows)
    const behaviorId = await repository.saveRecognitionResult(result, rows[0]?.deviceNumber ?? null)
    return { saved: true, selectedCount: rows.length, behaviorId, message: '智能识别完成，行为数据已保存' }
  },
})
