/**
 * 阅读导航：赛方 AI HTTP 适配：从 recognition.json 构造请求、设置超时并解析响应路径；真实协议未配置时明确失败，不猜赛方字段。
 * 入口位置：modules/behavior/adapters/recognition.http.ts
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { z } from 'zod'

import type { RecognitionInputRow } from '../types.js'

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
    // 比赛 AI 的地址、请求方法和响应位置都留在现场配置，不能假设它永远
    // 接受固定的 rows JSON。没有正式文档时 url 保持空，调用会明确报错。
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
    // $rows 等模板变量在这里替换成已从数据库重查的历史数据，而非浏览器原样值。
    const entries: Array<[string, unknown]> = payload && typeof payload === 'object' && !Array.isArray(payload) ? Object.entries(payload) : [['data', payload]]
    const parameters = new URLSearchParams()
    entries.forEach(([key, value]) => parameters.set(key, typeof value === 'string' ? value : JSON.stringify(value)))
    const url = config.bodyType === 'query' ? `${config.url}${config.url.includes('?') ? '&' : '?'}${parameters}` : config.url
    const body = config.bodyType === 'json' ? JSON.stringify(payload) : config.bodyType === 'form' ? parameters : undefined
    const response = await (options.fetchImpl || fetch)(url, {
      // timeoutMs 防止赛方接口无响应时一直占住后端请求。
      method: config.method, headers: config.headers, body,
      signal: AbortSignal.timeout(config.timeoutMs),
    })
    if (!response.ok) throw new Error(`智能识别接口调用失败：HTTP ${response.status}`)
    const responsePayload: unknown = await response.json()
    const result = valueAtPath(responsePayload, config.responseDataPath)
    // 只将 responseDataPath 指向的对象交给行为字段映射；数组或路径缺失拒绝入库。
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('智能识别响应路径没有得到对象，请检查 responseDataPath')
    return result as Record<string, unknown>
  },
})
