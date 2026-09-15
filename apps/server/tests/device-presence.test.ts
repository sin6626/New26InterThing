import { describe, expect, it, vi } from 'vitest'

import { createDevicePresenceService } from '../src/modules/device/presence.js'

describe('device presence service', () => {
  it('marks realtime activity online and emits offline after configured timeout', async () => {
    let now = 1_000
    const emit = vi.fn()
    const reportOffline = vi.fn().mockResolvedValue(undefined)
    const presence = createDevicePresenceService({
      clock: () => now,
      loadOfflineTimeoutSeconds: vi.fn().mockResolvedValue(3),
      emit,
      reportOffline,
    })

    presence.recordActivity('device-1')
    expect(presence.getSnapshot('device-1').status).toBe('online')

    now = 4_001
    await presence.tick()

    expect(presence.getSnapshot('device-1').status).toBe('offline')
    expect(reportOffline).toHaveBeenCalledWith('device-1', expect.stringContaining('3 秒'))
    expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({
      type: 'device.presence',
      data: expect.objectContaining({ status: 'offline' }),
    }))
  })

  it('reports one offline event per online period', async () => {
    let now = 1_000
    const reportOffline = vi.fn().mockResolvedValue(undefined)
    const presence = createDevicePresenceService({
      clock: () => now,
      loadOfflineTimeoutSeconds: vi.fn().mockResolvedValue(1),
      emit: vi.fn(),
      reportOffline,
    })
    presence.recordActivity('device-1')
    now = 2_001
    await presence.tick()
    await presence.tick()
    presence.recordActivity('device-1')
    now = 3_002
    await presence.tick()

    expect(reportOffline).toHaveBeenCalledTimes(2)
  })
})
