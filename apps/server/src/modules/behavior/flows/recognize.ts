/**
 * 阅读导航：行为识别流程：按 ID 重查真实历史数据，检查是否同一设备，再调用 AI 并保存映射结果；不能信任前端直接传来的传感器值。
 * 入口位置：modules/behavior/flows/recognize.ts
 */

import type { RecognitionResult } from '@new26interthing/shared'

import type { BehaviorRepository } from '../types.js'
import { createRecognitionAdapter, type RecognitionAdapter } from '../adapters/recognition.http.js'
import type { OperationHistoryRepository } from '../../operation-history/index.js'

export interface RecognitionService { recognize(rowIds: number[]): Promise<RecognitionResult> }

/** 读取选中历史数据、调用赛方适配器，再按动态字段映射保存识别结果。 */
export const createRecognitionService = (
  repository: BehaviorRepository,
  adapter: RecognitionAdapter = createRecognitionAdapter(),
  history?: OperationHistoryRepository,
): RecognitionService => ({
  async recognize(rowIds) {
    const rows = await repository.getRecognitionRows(rowIds)
    if (rows.length !== rowIds.length) throw new Error('部分历史数据不存在，请刷新页面后重新选择')
    const deviceNumbers = new Set(rows.map(row => row.deviceNumber).filter(Boolean))
    if (deviceNumbers.size > 1) throw new Error('一次智能识别只能选择同一设备的历史数据')
    const deviceNumber = rows[0]?.deviceNumber ?? null
    await history?.record({
      source: 'application', triggerMode: 'manual',
      commandType: 'recognition_request', deviceNumber,
      commandName: '发起智能识别', newValue: String(rows.length),
      result: 'success',
    })
    let behaviorId: number
    try {
      const result = await adapter.recognize(rows)
      behaviorId = await repository.saveRecognitionResult(result, deviceNumber)
    } catch (error) {
      await Promise.resolve(history?.record({
        source: 'recognition', commandType: 'recognition', deviceNumber,
        commandName: '智能识别结果', result: 'failed',
      })).catch((logError) => console.error('智能识别失败历史写入失败', logError))
      throw error
    }
    await history?.record({
      source: 'recognition', commandType: 'recognition', deviceNumber,
      commandName: '智能识别结果', newValue: String(behaviorId),
      relatedId: behaviorId, result: 'success',
    })
    return { saved: true, selectedCount: rows.length, behaviorId, message: '智能识别完成，行为数据已保存' }
  },
})
