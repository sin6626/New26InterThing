import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { RecognitionResult } from '@new26interthing/shared'

import type { BehaviorRepository } from './behavior.repository.js'

export interface RecognitionService { recognize(rowIds: number[]): Promise<RecognitionResult> }

interface RecognitionConfig { url: string; method: string; timeoutMs: number; headers: Record<string, string>; requestTemplate: unknown; responseDataPath: string }

const valueAtPath = (source: unknown, pathValue: string): unknown => pathValue
  ? pathValue.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, source)
  : source

const applyTemplate = (template: unknown, rows: unknown[]): unknown => {
  if (template === '$rows') return rows
  if (template === '$firstRow') return rows[0]
  if (template === '$selectedCount') return rows.length
  if (typeof template === 'string' && template.startsWith('$firstRow.')) return valueAtPath(rows[0], template.slice('$firstRow.'.length))
  if (Array.isArray(template)) return template.map(value => applyTemplate(value, rows))
  if (template && typeof template === 'object') return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, applyTemplate(value, rows)]))
  return template
}

export const createRecognitionService = (repository: BehaviorRepository, options: { configPath?: string; fetchImpl?: typeof fetch } = {}): RecognitionService => ({
  async recognize(rowIds: number[]): Promise<RecognitionResult> {
    const rows = await repository.getRecognitionRows(rowIds)
    if (rows.length !== rowIds.length) throw new Error('部分历史数据不存在，请刷新页面后重新选择')
    const configPath = options.configPath || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../config/recognition.json')
    const config = JSON.parse(await fs.readFile(configPath, 'utf8')) as RecognitionConfig
    if (!config.url) throw new Error('智能识别接口尚未配置，请填写 apps/server/config/recognition.json')
    const deviceNumbers = new Set(rows.map(row => row.deviceNumber).filter(Boolean))
    if (deviceNumbers.size > 1) throw new Error('一次智能识别只能选择同一设备的历史数据')
    const response = await (options.fetchImpl || fetch)(config.url, {
      method: config.method || 'POST', headers: config.headers, body: JSON.stringify(applyTemplate(config.requestTemplate, rows)),
      signal: AbortSignal.timeout(config.timeoutMs || 10_000),
    })
    if (!response.ok) throw new Error(`智能识别接口调用失败：HTTP ${response.status}`)
    const payload: unknown = await response.json()
    const result = valueAtPath(payload, config.responseDataPath)
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('智能识别响应路径没有得到对象，请检查 responseDataPath')
    const behaviorId = await repository.saveRecognitionResult(result as Record<string, unknown>, rows[0]?.deviceNumber ?? null)
    return { saved: true, selectedCount: rows.length, behaviorId, message: '智能识别完成，行为数据已保存' }
  },
})
