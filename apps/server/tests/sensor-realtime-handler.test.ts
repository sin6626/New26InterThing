import { describe, expect, it, vi } from 'vitest'

import type { SensorRealtimeMessage } from '@new26interthing/shared'

import { createSensorRealtimeHandler } from '../src/modules/realtime/sensor-realtime-handler.js'
import type { SensorRepository } from '../src/modules/realtime/sensor.repository.js'

describe('sensor realtime handler', () => {
  it('broadcasts the saved reading after the database write succeeds', async () => {
    const savedReading = {
      deviceNumber: '202111',
      recordedAt: '2026-09-11 09:30:00',
      fields: { 出水温度: 28.7, 流量: 2.4 },
    }
    const repository: SensorRepository = {
      save: vi.fn().mockResolvedValue(savedReading),
    }
    const broadcast = vi.fn<(message: SensorRealtimeMessage) => void>()
    const handle = createSensorRealtimeHandler({ repository, broadcast })
    const input = {
      deviceNumber: '202111',
      recordedAt: '2026-09-11 09:30:00',
      values: { temp_out: 28.7, flow_rate: 2.4 },
    }

    await handle(input)

    expect(repository.save).toHaveBeenCalledWith(input)
    expect(broadcast).toHaveBeenCalledWith({
      type: 'sensor.realtime',
      data: savedReading,
    })
  })

  it('does not broadcast when the database write fails', async () => {
    const repository: SensorRepository = {
      save: vi.fn().mockRejectedValue(new Error('database unavailable')),
    }
    const broadcast = vi.fn<(message: SensorRealtimeMessage) => void>()
    const handle = createSensorRealtimeHandler({ repository, broadcast })

    await expect(
      handle({
        deviceNumber: '202111',
        recordedAt: '2026-09-11 09:30:00',
        values: { temp_out: 28.7 },
      }),
    ).rejects.toThrow('database unavailable')
    expect(broadcast).not.toHaveBeenCalled()
  })
})
