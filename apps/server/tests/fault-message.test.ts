import { describe, expect, it } from 'vitest'

import { parseFaultMessage } from '../src/modules/fault/fault-message.js'

describe('fault message parser', () => {
  it('normalizes the old device error payload', () => {
    expect(parseFaultMessage('device/error', Buffer.from(JSON.stringify({
      d_no: '202111', e_no: 'E001', type: 3, e_msg: '传感器异常', c_time: '2026-09-11 10:00:00',
    })))).toEqual({
      accepted: true,
      message: {
        deviceNumber: '202111', errorNumber: 'E001', type: '3', message: '传感器异常', occurredAt: '2026-09-11 10:00:00',
      },
    })
  })

  it('uses server time when the device omits time', () => {
    const now = new Date('2026-09-11T02:00:00.000Z')
    const result = parseFaultMessage('device/error', Buffer.from('{"d_no":"1","e_no":"E1","type":"2"}'), () => now)
    expect(result.accepted && result.message.occurredAt).toBe(now)
  })

  it.each([
    ['wrong topic', 'another/topic', '{}'],
    ['invalid json', 'device/error', '{'],
    ['missing device', 'device/error', '{"e_no":"E1","type":"2"}'],
    ['missing error number', 'device/error', '{"d_no":"1","type":"2"}'],
    ['missing type', 'device/error', '{"d_no":"1","e_no":"E1"}'],
  ])('rejects %s', (_name, topic, payload) => {
    expect(parseFaultMessage(topic, Buffer.from(payload)).accepted).toBe(false)
  })
})
