import { describe, expect, it, vi } from 'vitest'

import { createSensorRepository } from '../src/modules/realtime/sensor.repository.js'

describe('sensor repository', () => {
  it('rejects a payload when none of its fields exist in the mapper', async () => {
    const query = vi.fn().mockResolvedValueOnce([[
      { f_name: '出水温度', db_name: 'field1', p_name: 'temp_out', visible: '1' },
    ]])
    const repository = createSensorRepository({ query } as never)

    await expect(repository.save({
      deviceNumber: '202111',
      recordedAt: '2026-09-11 09:30:00',
      values: { unknown: 1 },
    })).rejects.toThrow('没有可映射的传感器字段')
    expect(query).toHaveBeenCalledTimes(1)
  })
})
