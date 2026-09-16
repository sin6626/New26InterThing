import { describe, expect, it, vi } from 'vitest'
import { createDeviceActuatorHistory } from '../src/modules/operation-history/device-actuators.js'
import type { OperationHistoryRepository } from '../src/modules/operation-history/types.js'
import type { AutomationReading } from '../src/modules/automation/types.js'

const reading = (pump: 'on' | 'off' | 'unknown', heater: 'on' | 'off' | 'unknown'): AutomationReading => ({
  recordedAt: 1,
  pressure: null,
  outletTemperature: null,
  inletTemperature: null,
  flowRate: null,
  actualPump: pump,
  actualHeater: heater,
})

describe('device actuator history', () => {
  it('records only actual switch transitions, not the initial or repeated reading', async () => {
    const record = vi.fn()
    const history = { record } as unknown as OperationHistoryRepository
    const observe = createDeviceActuatorHistory(history)

    await observe('device-1', reading('off', 'off'))
    await observe('device-1', reading('off', 'off'))
    await observe('device-1', reading('on', 'unknown'))
    await observe('device-1', reading('on', 'off'))

    expect(record).toHaveBeenCalledTimes(1)
    expect(record).toHaveBeenCalledWith(expect.objectContaining({
      source: 'device',
      deviceNumber: 'device-1',
      commandType: 'pump',
      oldValue: 'off',
      newValue: 'on',
    }))
  })
})
