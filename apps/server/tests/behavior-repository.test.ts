import { describe, expect, it, vi } from 'vitest'

import { createBehaviorRepository } from '../src/modules/behavior/behavior.mysql.js'

const mappings = [
  { f_name: '行为', db_name: 'field2', p_name: 'action', unit: '', type: '2', visible: '1' },
  { f_name: '非法', db_name: 'remarks', p_name: 'unsafe', unit: '', type: '2', visible: '1' },
]

describe('behavior repository', () => {
  it('uses only allowed mapped columns when saving a recognition result', async () => {
    const query = vi.fn().mockResolvedValueOnce([mappings]).mockResolvedValueOnce([{ insertId: 17 }])
    const repository = createBehaviorRepository({ query } as never)
    await expect(repository.saveRecognitionResult({ action: '装载', unsafe: '不能写入' }, '202111')).resolves.toBe(17)
    expect(query.mock.calls[1][0]).toBe('insert into t_behavior_data (d_no, field2, c_time, online) values (?, ?, ?, ?)')
    expect(query.mock.calls[1][1][0]).toBe('202111')
    expect(query.mock.calls[1][1][1]).toBe('装载')
  })

  it('rejects a result that does not match the configured behavior fields', async () => {
    const query = vi.fn().mockResolvedValueOnce([mappings])
    const repository = createBehaviorRepository({ query } as never)
    await expect(repository.saveRecognitionResult({ unknown: true }, '202111')).rejects.toThrow('没有匹配任何行为字段')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('loads selected sensor rows in stable time order with semantic field names', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ f_name: '压力', db_name: 'field4', p_name: 'pressure', unit: 'kPa', type: '1', visible: '1' }]])
      .mockResolvedValueOnce([[{ id: 3, d_no: '202111', field4: '12', c_time: '2026-09-12 10:00:00' }]])
    const repository = createBehaviorRepository({ query } as never)
    await expect(repository.getRecognitionRows([3])).resolves.toEqual([{ deviceNumber: '202111', recordedAt: '2026-09-12 10:00:00', pressure: '12' }])
    expect(query.mock.calls[1][0]).toContain('order by c_time, id')
  })
})
