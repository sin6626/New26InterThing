import { describe, expect, it } from 'vitest'

import { parseSensorMessage } from '../src/modules/realtime/sensor-message.js'

describe('parseSensorMessage', () => {
  it('parses the compatible device/sensor payload', () => {
    const result = parseSensorMessage(
      'device/sensor',
      Buffer.from('{"d_no":"202111","temp_out":28.7,"flow_rate":2.4,"c_time":"2026-09-11 09:30:00"}'),
    )

    expect(result).toEqual({
      accepted: true,
      message: {
        deviceNumber: '202111',
        recordedAt: '2026-09-11 09:30:00',
        values: { temp_out: 28.7, flow_rate: 2.4 },
      },
    })
  })

  it.each([
    ['other topic', 'device/behavior', '{"d_no":"202111","temp_out":28.7}', '不支持的主题'],
    ['invalid JSON', 'device/sensor', '{bad json', 'JSON解析失败'],
    ['missing device number', 'device/sensor', '{"temp_out":28.7}', '缺少d_no'],
    ['no sensor values', 'device/sensor', '{"d_no":"202111","online":"实时数据"}', '没有传感器字段'],
  ])('rejects %s without throwing', (_caseName, topic, payload, reason) => {
    expect(parseSensorMessage(topic, Buffer.from(payload))).toEqual({
      accepted: false,
      reason,
    })
  })
})
