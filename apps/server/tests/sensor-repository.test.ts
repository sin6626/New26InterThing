import { describe, expect, it, vi } from 'vitest'

import { createSensorRepository } from '../src/modules/realtime/sensor.repository.js'

describe('sensor repository', () => {
  it('maps payload fields into the existing table and returns visible values', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[
        { f_name: '出水温度', db_name: 'field1', p_name: 'temp_out', visible: '1' },
        { f_name: '内部值', db_name: 'field2', p_name: 'internal', visible: '0' },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const repository = createSensorRepository({ query } as never, async () => 0)

    await expect(repository.save({
      deviceNumber: '202111',
      recordedAt: '2026-09-11 09:30:00',
      dataKind: 'realtime',
      values: { temp_out: 28.7, internal: 2 },
    })).resolves.toEqual({
      deviceNumber: '202111',
      recordedAt: '2026-09-11 09:30:00',
      dataKind: 'realtime',
      fields: { temp_out: 28.7 },
    })
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('insert into t_sensor_data (d_no, field1, field2, c_time, online, vstatus)'),
      ['202111', 28.7, 2, '2026-09-11 09:30:00', '0', 0],
    )
  })

  it('rejects a payload when none of its fields exist in the mapper', async () => {
    const query = vi.fn().mockResolvedValueOnce([[
      { f_name: '出水温度', db_name: 'field1', p_name: 'temp_out', visible: '1' },
    ]])
    const repository = createSensorRepository({ query } as never, async () => 0)

    await expect(repository.save({
      deviceNumber: '202111',
      recordedAt: '2026-09-11 09:30:00',
      dataKind: 'realtime',
      values: { unknown: 1 },
    })).rejects.toThrow('没有可映射的传感器字段')
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('persists an evaluated alarm status with the sensor history row', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([[
        { f_name: '压力', db_name: 'field1', p_name: 'pressure', visible: '1' },
      ]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
    const evaluateVstatus = vi.fn().mockResolvedValue(1)
    const repository = createSensorRepository({ query } as never, evaluateVstatus)
    const message = {
      deviceNumber: '202111',
      recordedAt: '2026-09-14 18:00:00',
      dataKind: 'realtime' as const,
      values: { pressure: 26 },
    }

    await repository.save(message)

    expect(evaluateVstatus).toHaveBeenCalledWith(message)
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining('insert into t_sensor_data'),
      ['202111', 26, '2026-09-14 18:00:00', '0', 1],
    )
  })
})
