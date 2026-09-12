import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { BehaviorRepository } from '../src/modules/behavior/behavior.repository.js'
import { createRecognitionAdapter } from '../src/modules/behavior/recognition.adapter.js'
import { createRecognitionService } from '../src/modules/behavior/recognition.service.js'

const configPath = path.resolve(process.cwd(), 'tests/fixtures/recognition.json')
const emptyConfigPath = path.resolve(process.cwd(), 'tests/fixtures/recognition-empty.json')
const invalidConfigPath = path.resolve(process.cwd(), 'tests/fixtures/recognition-invalid.json')

describe('recognition service', () => {
  it('loads selected rows, applies offline config, and saves the mapped result once', async () => {
    const repository: BehaviorRepository = {
      getOptions: vi.fn(), list: vi.fn(),
      getRecognitionRows: vi.fn().mockResolvedValue([{ deviceNumber: '202111', recordedAt: '2026-09-12 10:00:00', pressure: 12 }]),
      saveRecognitionResult: vi.fn().mockResolvedValue(88),
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { behavior: { action: '装载' } } }), { status: 200 }))
    const adapter = createRecognitionAdapter({ configPath, fetchImpl })
    const service = createRecognitionService(repository, adapter)

    await expect(service.recognize([9])).resolves.toEqual({ saved: true, selectedCount: 1, behaviorId: 88, message: '智能识别完成，行为数据已保存' })
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:9000/infer', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ samples: [{ deviceNumber: '202111', recordedAt: '2026-09-12 10:00:00', pressure: 12 }], count: 1 }),
    }))
    expect(repository.saveRecognitionResult).toHaveBeenCalledWith({ action: '装载' }, '202111')
  })

  it('does not call the external interface when a selected row no longer exists', async () => {
    const recognize = vi.fn()
    const repository = { getOptions: vi.fn(), list: vi.fn(), getRecognitionRows: vi.fn().mockResolvedValue([]), saveRecognitionResult: vi.fn() }
    const service = createRecognitionService(repository, { recognize })
    await expect(service.recognize([9])).rejects.toThrow('部分历史数据不存在')
    expect(recognize).not.toHaveBeenCalled()
  })

  it('reports HTTP and response-path failures before saving data', async () => {
    const row = [{ deviceNumber: '202111', recordedAt: null, pressure: 12 }]
    const failed = createRecognitionAdapter({ configPath, fetchImpl: vi.fn().mockResolvedValue(new Response('{}', { status: 503 })) })
    await expect(failed.recognize(row)).rejects.toThrow('HTTP 503')

    const wrongPath = createRecognitionAdapter({ configPath, fetchImpl: vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: {} }), { status: 200 })) })
    await expect(wrongPath.recognize(row)).rejects.toThrow('responseDataPath')
  })

  it('gives actionable Chinese errors for an empty URL or broken JSON', async () => {
    const row = [{ deviceNumber: '202111', recordedAt: null, pressure: 12 }]
    await expect(createRecognitionAdapter({ configPath: emptyConfigPath }).recognize(row)).rejects.toThrow('智能识别接口尚未配置')
    await expect(createRecognitionAdapter({ configPath: invalidConfigPath }).recognize(row)).rejects.toThrow('无法读取智能识别配置')
  })
})
