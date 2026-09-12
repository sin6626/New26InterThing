import { afterEach, describe, expect, it, vi } from 'vitest'

import { createApp } from '../src/app.js'

const servers: Array<{ close(): void }> = []
afterEach(() => servers.splice(0).forEach(server => server.close()))

const start = async (recognize = vi.fn().mockResolvedValue({ saved: true, selectedCount: 2, behaviorId: 7, message: '智能识别完成，行为数据已保存' })) => {
  const behaviorRepository = { getOptions: vi.fn().mockResolvedValue({ fields: [] }), list: vi.fn().mockResolvedValue({ items: [], total: 0 }), getRecognitionRows: vi.fn(), saveRecognitionResult: vi.fn() }
  const server = createApp({
    deviceRepository: { list: vi.fn() }, faultRepository: { findMappedMessage: vi.fn(), save: vi.fn(), getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn() },
    sensorHistoryRepository: { getOptions: vi.fn(), list: vi.fn(), getTrend: vi.fn() }, behaviorRepository, recognitionService: { recognize },
  }).listen(0)
  servers.push(server); await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  return { baseUrl: `http://127.0.0.1:${address.port}`, recognize }
}

describe('behavior HTTP API', () => {
  it('recognizes selected history row ids through the public API', async () => {
    const { baseUrl, recognize } = await start()
    const response = await fetch(`${baseUrl}/api/behaviors/recognize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIds: [3, 4] }) })
    expect(response.status).toBe(200); expect(recognize).toHaveBeenCalledWith([3, 4])
  })
  it('rejects empty or duplicate history row ids', async () => {
    const { baseUrl, recognize } = await start()
    const response = await fetch(`${baseUrl}/api/behaviors/recognize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIds: [3, 3] }) })
    expect(response.status).toBe(400); expect(recognize).not.toHaveBeenCalled()
  })
  it('returns actionable recognition failures without hiding the configuration error', async () => {
    const { baseUrl } = await start(vi.fn().mockRejectedValue(new Error('智能识别接口尚未配置')))
    const response = await fetch(`${baseUrl}/api/behaviors/recognize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rowIds: [3] }) })
    expect(response.status).toBe(422); expect(await response.json()).toEqual({ code: 422, message: '智能识别接口尚未配置', data: null })
  })
})
