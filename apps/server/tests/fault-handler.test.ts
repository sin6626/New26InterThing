import { describe, expect, it, vi } from 'vitest'

import { createFaultHandler } from '../src/modules/fault/fault-handler.js'

const message = {
  deviceNumber: '202111', errorNumber: 'E001', type: '3', message: '设备原文', occurredAt: '2026-09-11 10:00:00',
}

describe('fault handler', () => {
  it('prefers the database mapping before saving', async () => {
    const repository = {
      findMappedMessage: vi.fn().mockResolvedValue('映射中文'), save: vi.fn(), getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    await createFaultHandler(repository)(message)
    expect(repository.save).toHaveBeenCalledWith({ ...message, message: '映射中文' })
  })

  it('falls back to device text and then an explicit default', async () => {
    const repository = {
      findMappedMessage: vi.fn().mockResolvedValue(null), save: vi.fn(), getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    const handle = createFaultHandler(repository)
    await handle(message)
    await handle({ ...message, message: undefined })
    expect(repository.save).toHaveBeenNthCalledWith(1, message)
    expect(repository.save).toHaveBeenNthCalledWith(2, { ...message, message: '故障编号 E001（类型 3）' })
  })

  it('does not save when mapping fails', async () => {
    const repository = {
      findMappedMessage: vi.fn().mockRejectedValue(new Error('mapping failed')), save: vi.fn(), getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    await expect(createFaultHandler(repository)(message)).rejects.toThrow('mapping failed')
    expect(repository.save).not.toHaveBeenCalled()
  })
})
