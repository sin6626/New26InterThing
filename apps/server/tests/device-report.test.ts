import {
  describe,
  expect,
  it,
} from 'vitest'

import { parseDeviceReport } from '../src/modules/control/adapters/device-report.js'

describe('device command report parser', () => {
  it('parses the legacy device/direct report', () => {
    const payload = Buffer.from(JSON.stringify({
      d_no: 'e46488d793245429',
      config_id: 23,
      value: 'pump on',
    }))

    expect(parseDeviceReport(payload)).toEqual({
      deviceNumber: 'e46488d793245429',
      configId: 23,
      value: 'on',
    })
  })

  it('rejects malformed JSON and incomplete reports', () => {
    expect(() => parseDeviceReport(Buffer.from('{bad')))
      .toThrow('设备指令上报 JSON 解析失败')
    expect(() => parseDeviceReport(Buffer.from('{}')))
      .toThrow('设备指令上报缺少 d_no、config_id 或 value')
  })
})
