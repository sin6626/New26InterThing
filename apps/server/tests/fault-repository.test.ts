import { describe, expect, it, vi } from 'vitest'

import { createFaultRepository } from '../src/modules/fault/mysql.js'

describe('fault repository', () => {
  it('maps database rows and uses the same filters for count and list', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        { id: 7, d_no: '202111', e_no: 'E001', type: '3', source: 'system', e_msg: '传感器故障', c_time: '2026-09-11 10:00:00' },
      ]])
    const repository = createFaultRepository({ query } as never)
    const input = {
      page: 2, pageSize: 10, deviceNumber: '202111', type: '3', source: 'system' as const,
      startTime: '2026-09-10 08:00:00', endTime: '2026-09-11 10:00:00',
    }

    await expect(repository.list(input)).resolves.toEqual({
      total: 1,
      items: [{
        id: 7, deviceNumber: '202111', errorNumber: 'E001', type: '3', source: 'system', message: '传感器故障', occurredAt: '2026-09-11 10:00:00',
      }],
    })
    expect(query.mock.calls[0][0]).toContain('d_no = ?')
    expect(query.mock.calls[0][0]).toContain('type = ?')
    expect(query.mock.calls[0][0]).toContain("coalesce(fault_source.source, 'system') = ?")
    expect(query.mock.calls[0][1]).toEqual(['202111', '3', 'system', '2026-09-10 08:00:00', '2026-09-11 10:00:00'])
    expect(query.mock.calls[1][1]).toEqual(['202111', '3', 'system', '2026-09-10 08:00:00', '2026-09-11 10:00:00', 10, 10])
  })

  it('returns statistics for all rows matching the filters', async () => {
    const query = vi.fn().mockResolvedValueOnce([[
      { type: '3', total: 4 }, { type: null, total: 1 },
    ]])
    const repository = createFaultRepository({ query } as never)

    await expect(repository.getStatistics({ deviceNumber: '202111' })).resolves.toEqual([
      { type: '3', label: '类型 3', count: 4 },
      { type: null, label: '未知类型', count: 1 },
    ])
    expect(query.mock.calls[0][0]).toContain('d_no = ?')
    expect(query.mock.calls[0][1]).toEqual(['202111'])
  })

  it('looks up mappings and saves with parameterized SQL', async () => {
    const query = vi.fn().mockResolvedValueOnce([[{ e_msg: '中文映射' }]])
    const connection = {
      beginTransaction: vi.fn(),
      execute: vi.fn()
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 88 }])
        .mockResolvedValueOnce([{ affectedRows: 1 }]),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    }
    const repository = createFaultRepository({ query, getConnection: vi.fn().mockResolvedValue(connection) } as never)

    await expect(repository.findMappedMessage('E001', '3')).resolves.toBe('中文映射')
    await expect(repository.save({
      deviceNumber: '202111', errorNumber: 'E001', type: '3', source: 'intelligence', message: '中文映射', occurredAt: '2026-09-11 10:00:00',
    })).resolves.toEqual({
      id: 88,
      deviceNumber: '202111',
      errorNumber: 'E001',
      type: '3',
      source: 'intelligence',
      message: '中文映射',
      occurredAt: '2026-09-11 10:00:00',
    })
    expect(query.mock.calls[0][1]).toEqual(['E001', '3'])
    expect(connection.execute.mock.calls[0][1]).toEqual(['202111', '2026-09-11 10:00:00', '中文映射', 'E001', '3'])
    expect(connection.execute.mock.calls[1][1]).toEqual([88, 'intelligence'])
    expect(connection.commit).toHaveBeenCalledOnce()
  })

  it('rolls back when saving the fault source fails', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      execute: vi.fn()
        .mockResolvedValueOnce([{ affectedRows: 1, insertId: 88 }])
        .mockRejectedValueOnce(new Error('source insert failed')),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    }
    const repository = createFaultRepository({
      getConnection: vi.fn().mockResolvedValue(connection),
    } as never)

    await expect(repository.save({
      deviceNumber: '202111',
      errorNumber: 'E001',
      type: '3',
      source: 'system',
      message: '中文映射',
      occurredAt: '2026-09-11 10:00:00',
    })).rejects.toThrow('source insert failed')
    expect(connection.rollback).toHaveBeenCalledOnce()
    expect(connection.commit).not.toHaveBeenCalled()
    expect(connection.release).toHaveBeenCalledOnce()
  })
})
