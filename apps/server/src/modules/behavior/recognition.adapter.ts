import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import type { RecognitionInputRow } from './behavior.repository.js'

const configSchema = z.object({
  url: z.string(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).default('POST'),
  bodyType: z.enum(['json', 'form', 'query', 'none']).default('json'),
  timeoutMs: z.number().int().positive().max(120_000).default(10_000),
  headers: z.record(z.string(), z.string()).default({ 'Content-Type': 'application/json' }),
  requestTemplate: z.unknown(),
  responseDataPath: z.string().default(''),
}).refine(config => config.method !== 'GET' || config.bodyType === 'query' || config.bodyType === 'none', {
  message: 'GET 请求的 bodyType 只能是 query 或 none', path: ['bodyType'],
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
    let rawConfig: unknown
    try { rawConfig = JSON.parse(await fs.readFile(configPath, 'utf8')) } catch (error) {
      throw new Error(`无法读取智能识别配置 ${configPath}：${error instanceof Error ? error.message : '文件格式错误'}`)
    }
    const parsedConfig = configSchema.safeParse(rawConfig)
    if (!parsedConfig.success) throw new Error(`智能识别配置错误：${parsedConfig.error.issues[0]?.message || '格式不正确'}`)
    const config = parsedConfig.data
    if (!config.url) throw new Error('智能识别接口尚未配置，请填写 apps/server/config/recognition.json')
    const payload = applyTemplate(config.requestTemplate, rows)
    const entries: Array<[string, unknown]> = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.entries(payload) : [['data', payload]]
    const parameters = new URLSearchParams()
    entries.forEach(([key, value]) => parameters.set(key, typeof value === 'string' ? value : JSON.stringify(value)))
    const url = config.bodyType === 'query' ? `${config.url}${config.url.includes('?') ? '&' : '?'}${parameters}` : config.url
    const body = config.bodyType === 'json' ? JSON.stringify(payload) : config.bodyType === 'form' ? parameters : undefined
    const response = await (options.fetchImpl || fetch)(url, {
      method: config.method, headers: config.headers, body,
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    if (!response.ok) throw new Error(`智能识别接口调用失败：HTTP ${response.status}`)
    const responsePayload: unknown = await response.json()
    const result = valueAtPath(responsePayload, config.responseDataPath)
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('智能识别响应路径没有得到对象，请检查 responseDataPath')
    return result as Record<string, unknown>
  },
})
