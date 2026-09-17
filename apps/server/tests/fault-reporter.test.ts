import { describe, expect, it, vi } from 'vitest'

import { createFaultReporter } from '../src/modules/fault/report.js'

const report = { deviceNumber: '202111', errorNumber: 'LOW_FLOW', type: '6', source: 'system' as const, detail: '流量 0.10L/min' }

describe('fault reporter', () => {
  it('suppresses a disabled diagnostic rule before mapping, saving, or notifying', async () => {
    const repository = {
      findMappedMessage: vi.fn(), save: vi.fn(),
      getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    const broadcast = vi.fn()
    const reporter = createFaultReporter({
      repository,
      broadcast,
      getRule: vi.fn().mockResolvedValue({
        faultCode: 'LOW_FLOW', name: '测试规则', category: 'diagnostic',
        protectionEnabled: false, protectionLocked: false,
        recordEnabled: true, notificationEnabled: true,
      }),
    })

    await expect(reporter.reportFault(report)).resolves.toBeNull()
    expect(repository.findMappedMessage).not.toHaveBeenCalled()
    expect(repository.save).not.toHaveBeenCalled()
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('can notify without saving a history record', async () => {
    const repository = {
      findMappedMessage: vi.fn().mockResolvedValue('设备离线'),
      save: vi.fn(),
      getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    const broadcast = vi.fn()
    const reporter = createFaultReporter({
      repository,
      broadcast,
      getRule: vi.fn().mockResolvedValue({
        faultCode: 'E002', name: '设备离线', category: 'communication',
        protectionEnabled: true, protectionLocked: false,
        recordEnabled: false, notificationEnabled: true,
      }),
    })

    await reporter.reportFault({ ...report, errorNumber: 'E002' })

    expect(repository.save).not.toHaveBeenCalled()
    expect(broadcast).toHaveBeenCalledWith(expect.objectContaining({ type: 'fault.alert' }))
  })

  it('can save a history record without notifying', async () => {
    const saved = {
      id: 9, ...report, message: '低流量', occurredAt: '2026-09-17 16:00:00',
    }
    const repository = {
      findMappedMessage: vi.fn().mockResolvedValue('低流量'),
      save: vi.fn().mockResolvedValue(saved),
      getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    const broadcast = vi.fn()
    const reporter = createFaultReporter({
      repository,
      broadcast,
      getRule: vi.fn().mockResolvedValue({
        faultCode: 'LOW_FLOW', name: '持续低流量', category: 'safety',
        protectionEnabled: true, protectionLocked: true,
        recordEnabled: true, notificationEnabled: false,
      }),
    })

    await reporter.reportFault(report)

    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(broadcast).not.toHaveBeenCalled()
  })

  it('maps, saves, and broadcasts one normalized fault', async () => {
    const saved = {
      id: 8, deviceNumber: '202111', errorNumber: 'LOW_FLOW', type: '6',
      source: 'system' as const, message: '失流干烧保护（流量 0.10L/min）', occurredAt: '2026-09-11 20:00:00',
    }
    const repository = {
      findMappedMessage: vi.fn().mockResolvedValue('失流干烧保护'),
      save: vi.fn().mockResolvedValue(saved),
      getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    const broadcast = vi.fn()
    const reporter = createFaultReporter({
      repository,
      broadcast,
      now: () => new Date('2026-09-11T12:00:00.000Z'),
    })

    await expect(reporter.reportFault(report)).resolves.toEqual(saved)
    expect(repository.findMappedMessage).toHaveBeenCalledWith('LOW_FLOW', '6')
    expect(repository.save).toHaveBeenCalledTimes(1)
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({
      deviceNumber: '202111', errorNumber: 'LOW_FLOW', type: '6', source: 'system', message: '失流干烧保护（流量 0.10L/min）',
      occurredAt: new Date('2026-09-11T12:00:00.000Z'),
    }))
    expect(broadcast).toHaveBeenCalledWith({ type: 'fault.alert', data: saved })
  })

  it('uses a readable fallback when the mapping is missing', async () => {
    const repository = {
      findMappedMessage: vi.fn().mockResolvedValue(null),
      save: vi.fn().mockImplementation(async (value) => ({ id: 1, ...value, occurredAt: '2026-09-11 20:00:00' })),
      getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    const reporter = createFaultReporter({ repository, broadcast: vi.fn() })
    await reporter.reportFault({ deviceNumber: '1', errorNumber: 'UNKNOWN_RULE', type: '6', source: 'system' })
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ message: '故障编号 UNKNOWN_RULE（类型 6）' }))
  })

  it('does not broadcast when mapping or saving fails', async () => {
    const broadcast = vi.fn()
    const mappingFailure = {
      findMappedMessage: vi.fn().mockRejectedValue(new Error('mapping failed')), save: vi.fn(),
      getOptions: vi.fn(), list: vi.fn(), getStatistics: vi.fn(),
    }
    await expect(createFaultReporter({ repository: mappingFailure, broadcast }).reportFault(report)).rejects.toThrow('mapping failed')
    expect(mappingFailure.save).not.toHaveBeenCalled()

    const saveFailure = {
      ...mappingFailure,
      findMappedMessage: vi.fn().mockResolvedValue('失流干烧保护'),
      save: vi.fn().mockRejectedValue(new Error('save failed')),
    }
    await expect(createFaultReporter({ repository: saveFailure, broadcast }).reportFault(report)).rejects.toThrow('save failed')
    expect(saveFailure.save).toHaveBeenCalledTimes(1)
    expect(broadcast).not.toHaveBeenCalled()
  })
})
