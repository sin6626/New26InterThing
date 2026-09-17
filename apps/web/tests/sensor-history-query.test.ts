import { describe, expect, it } from 'vitest'

import { resolveHistoryDeviceNumber } from '../app/features/sensor-history/history-query'

describe('sensor history query', () => {
  it('uses the only available device when the hidden selection is empty', () => {
    expect(resolveHistoryDeviceNumber('', ['e46488d793245429'])).toBe('e46488d793245429')
  })

  it('preserves an explicit device selection', () => {
    expect(resolveHistoryDeviceNumber('device-2', ['device-1', 'device-2'])).toBe('device-2')
  })
})
