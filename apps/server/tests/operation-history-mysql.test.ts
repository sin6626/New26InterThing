import type { Pool, PoolConnection } from 'mysql2/promise'
import { describe, expect, it, vi } from 'vitest'
import { createOperationHistoryRepository } from '../src/modules/operation-history/mysql.js'

describe('operation history MySQL adapter', () => {
  it('writes a source field to the new table, including inside an existing transaction', async () => {
    const query = vi.fn().mockResolvedValue([[]])
    const connection = { query } as unknown as PoolConnection
    const repository = createOperationHistoryRepository({ query: vi.fn() } as unknown as Pool)

    await repository.record({
      source: 'application', triggerMode: 'automatic',
      commandType: 'pump', deviceNumber: 'device-1',
      commandName: '水泵开关', oldValue: 'off', newValue: 'on',
      result: 'success',
    }, connection)

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('insert into t_operation_history'),
      ['application', 'automatic', 'pump', 'device-1', null, '水泵开关', 'off', 'on', 'success', null],
    )
    expect(query.mock.calls[0][0]).not.toContain('t_direct_history')
  })

  it('filters list results by the explicit source', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
    const repository = createOperationHistoryRepository({ query } as unknown as Pool)

    await expect(repository.listLogs({
      page: 1, pageSize: 20, source: 'recognition',
    })).resolves.toEqual({ items: [], total: 0 })
    expect(query.mock.calls[0][0]).toContain('source = ?')
    expect(query.mock.calls[0][1]).toEqual(['recognition'])
  })
})
