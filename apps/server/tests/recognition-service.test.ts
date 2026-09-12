import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { BehaviorRepository } from '../src/modules/behavior/behavior.repository.js'
import { createRecognitionService } from '../src/modules/behavior/recognition.service.js'

const configPath = path.resolve(process.cwd(), 'tests/fixtures/recognition.json')

describe('recognition service', () => {
  it('loads selected rows, applies offline config, and saves the mapped result once', async () => {
    const repository: BehaviorRepository = {
      getOptions: vi.fn(), list: vi.fn(),
      getRecognitionRows: vi.fn().mockResolvedValue([{ deviceNumber: '202111', recordedAt: '2026-09-12 10:00:00', pressure: 12 }]),
      saveRecognitionResult: vi.fn().mockResolvedValue(88),
    }
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ result: { behavior: { action: '装载' } } }), { status: 200 }))
    const service = createRecognitionService(repository, { configPath, fetchImpl })

    await expect(service.recognize([9])).resolves.toEqual({ saved: true, selectedCount: 1, behaviorId: 88, message: '智能识别完成，行为数据已保存' })
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:9000/infer', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ samples: [{ deviceNumber: '202111', recordedAt: '2026-09-12 10:00:00', pressure: 12 }], count: 1 }),
    }))
    expect(repository.saveRecognitionResult).toHaveBeenCalledWith({ action: '装载' }, '202111')
  })

  it('does not call the external interface when a selected row no longer exists', async () => {
    const fetchImpl = vi.fn()
    const repository = { getOptions: vi.fn(), list: vi.fn(), getRecognitionRows: vi.fn().mockResolvedValue([]), saveRecognitionResult: vi.fn() }
    const service = createRecognitionService(repository, { configPath, fetchImpl })
    await expect(service.recognize([9])).rejects.toThrow('部分历史数据不存在')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
