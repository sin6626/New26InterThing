import {
  describe,
  expect,
  it,
} from 'vitest'

import { normalizeAutomationReading } from '../src/modules/automation/adapters/reading.js'

describe('automation reading normalization', () => {
  it('uses the confirmed legacy field mapping', () => {
    expect(normalizeAutomationReading({
      field2: '31.2',
      field3: '30.1',
      field4: '88',
      field5: '1.5',
      field6: '1',
      field7: '0',
    }, 1_000)).toEqual({
      recordedAt: 1_000,
      outletTemperature: 31.2,
      inletTemperature: 30.1,
      pressure: 88,
      flowRate: 1.5,
      actualHeater: 'on',
      actualPump: 'off',
    })
  })

  it('prefers semantic MQTT fields and preserves missing values', () => {
    expect(normalizeAutomationReading({
      temp_out: 32,
      temp_in: 31,
      pressure: 60,
      flow_rate: 2,
      heat_Y1: 'off',
      water_Y2: 'on',
      field2: 99,
    }, 2_000)).toMatchObject({
      recordedAt: 2_000,
      outletTemperature: 32,
      inletTemperature: 31,
      pressure: 60,
      flowRate: 2,
      actualHeater: 'off',
      actualPump: 'on',
    })
  })

  it('distinguishes an invalid number from an omitted field', () => {
    const normalized = normalizeAutomationReading({
      pressure: 'not-a-number',
    }, 3_000)

    expect(Number.isNaN(normalized.pressure)).toBe(true)
    expect(normalized.flowRate).toBeNull()
  })

  it('treats empty and whitespace-only sensor values as invalid', () => {
    const normalized = normalizeAutomationReading({
      pressure: '',
      flow_rate: '   ',
    }, 4_000)

    expect(Number.isNaN(normalized.pressure)).toBe(true)
    expect(Number.isNaN(normalized.flowRate)).toBe(true)
  })

  it('keeps zero valid and converts the device disconnected sentinel to invalid', () => {
    const normalized = normalizeAutomationReading({
      pressure: 0,
      flow_rate: 0,
      temp_in: 0,
      temp_out: 6_553.5,
    }, 5_000)

    expect(normalized.pressure).toBe(0)
    expect(normalized.flowRate).toBe(0)
    expect(normalized.inletTemperature).toBe(0)
    expect(Number.isNaN(normalized.outletTemperature)).toBe(true)
  })

  it('treats the 600-range ff representation as disconnected', () => {
    const normalized = normalizeAutomationReading({
      pressure: 655.35,
      flow_rate: 655.35,
      temp_in: 655.35,
      temp_out: 655.35,
    }, 6_000)

    expect(Number.isNaN(normalized.pressure)).toBe(true)
    expect(Number.isNaN(normalized.flowRate)).toBe(true)
    expect(Number.isNaN(normalized.inletTemperature)).toBe(true)
    expect(Number.isNaN(normalized.outletTemperature)).toBe(true)
  })
})
