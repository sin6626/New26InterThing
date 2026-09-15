import { describe, expect, it, vi } from 'vitest'

import { createSensorHistoryRepository } from '../src/modules/sensor-history/mysql.js'

const mappings = [
  { f_name: '压力', db_name: 'field4', p_name: 'pressure', unit: 'kPa', type: '1', visible: '1' },
  { f_name: '隐藏值', db_name: 'field6', p_name: 'hidden', unit: '', type: '1', visible: '0' },
]

describe('sensor history repository', () => {
  it('maps visible database columns to protocol keys and preserves zero', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([mappings])
      .mockResolvedValueOnce([[{ total: 1 }]])
      .mockResolvedValueOnce([[
        { id: 9, d_no: '202111', field4: '0', field6: '8', vstatus: 0, online: '实时数据', c_time: '2026-09-11 10:00:00' },
      ]])
    const repository = createSensorHistoryRepository({ query } as never)

    await expect(repository.list({ page: 1, pageSize: 20, status: 'all' })).resolves.toEqual({
      total: 1,
      items: [{
        id: 9,
        deviceNumber: '202111',
        fields: { pressure: 0 },
        status: 'normal',
        statusCode: 0,
        online: '实时数据',
        recordedAt: '2026-09-11 10:00:00',
      }],
    })
  })

  it('uses the same filters for count and page queries', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([mappings])
      .mockResolvedValueOnce([[{ total: 0 }]])
      .mockResolvedValueOnce([[]])
    const repository = createSensorHistoryRepository({ query } as never)

    await repository.list({
      page: 2,
      pageSize: 10,
      deviceNumber: '202111',
      startTime: '2026-09-10 08:00:00',
      endTime: '2026-09-10 10:00:00',
      status: 'abnormal',
    })

    const countCall = query.mock.calls[1]
    const pageCall = query.mock.calls[2]
    expect(countCall[0]).toContain('d_no = ?')
    expect(countCall[0]).toContain('c_time >= ?')
    expect(countCall[0]).toContain('c_time <= ?')
    expect(countCall[0]).toContain('vstatus != 0')
    expect(pageCall[0]).toContain('d_no = ?')
    expect(pageCall[0]).toContain('c_time >= ?')
    expect(pageCall[0]).toContain('c_time <= ?')
    expect(pageCall[0]).toContain('vstatus != 0')
    expect(countCall[1]).toEqual(['202111', '2026-09-10 08:00:00', '2026-09-10 10:00:00'])
    expect(pageCall[1]).toEqual(['202111', '2026-09-10 08:00:00', '2026-09-10 10:00:00', 10, 10])
  })

  it('returns minute trend rows in chronological order', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([mappings])
      .mockResolvedValueOnce([[
        { minute_time: '2026-09-11 10:01:00', field4: '2.5' },
        { minute_time: '2026-09-11 10:00:00', field4: '0' },
      ]])
    const repository = createSensorHistoryRepository({ query } as never)

    await expect(repository.getTrend({ status: 'all', limit: 10 })).resolves.toEqual({
      times: ['2026-09-11 10:00:00', '2026-09-11 10:01:00'],
      series: [{ key: 'pressure', name: '压力', unit: 'kPa', data: [0, 2.5] }],
    })
  })
})
