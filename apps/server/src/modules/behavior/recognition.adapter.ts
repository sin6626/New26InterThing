import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import type { RecognitionInputRow } from './behavior.repository.js'

const configSchema = z.object({
  url: z.string(),
  method: z.enum(['POST', 'PUT', 'PATCH']).default('POST'),
  timeoutMs: z.number().int().positive().max(120_000).default(10_000),
  headers: z.record(z.string(), z.string()).default({ 'Content-Type': 'application/json' }),
  requestTemplate: z.unknown(),
  responseDataPath: z.string().default(''),
})

const valueAtPath = (source: unknown, pathValue: string): unknown => pathValue
  ? pathValue.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, source)
  : source

const applyTemplate = (template: unknown, rows: RecognitionInputRow[]): unknown => {
  if (template === '$rows') return rows
  if (template === '$firstRow') return rows[0]
  if (template === '$selectedCount') return rows.length
  if (typeof template === 'string' && template.startsWith('$firstRow.')) return valueAtPath(rows[0], template.slice('$firstRow.'.length))
  if (Array.isArray(template)) return template.map(value => applyTemplate(value, rows))
  if (template && typeof template === 'object') return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, applyTemplate(value, rows)]))
  return template
}

export interface RecognitionAdapter { recognize(rows: RecognitionInputRow[]): Promise<Record<string, unknown>> }

export const createRecognitionAdapter = (options: { configPath?: string; fetchImpl?: typeof fetch } = {}): RecognitionAdapter => ({
  async recognize(rows) {
    const configPath = options.configPath || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../config/recognition.json')
    const parsedConfig = configSchema.safeParse(JSON.parse(await fs.readFile(configPath, 'utf8')))
    if (!parsedConfig.success) throw new Error(`智能识别配置错误：${parsedConfig.error.issues[0]?.message || '格式不正确'}`)
    const config = parsedConfig.data
    if (!config.url) throw new Error('智能识别接口尚未配置，请填写 apps/server/config/recognition.json')
    const response = await (options.fetchImpl || fetch)(config.url, {
      method: config.method, headers: config.headers, body: JSON.stringify(applyTemplate(config.requestTemplate, rows)),
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    if (!response.ok) throw new Error(`智能识别接口调用失败：HTTP ${response.status}`)
    const payload: unknown = await response.json()
    const result = valueAtPath(payload, config.responseDataPath)
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('智能识别响应路径没有得到对象，请检查 responseDataPath')
    return result as Record<string, unknown>
  },
})
