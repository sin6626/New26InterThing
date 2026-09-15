import {
  describe,
  expect,
  it,
} from 'vitest'

import { buildCommandEnvelope } from '../src/modules/control/adapters/command.js'

describe('command adapter', () => {
  it('maps a value into the configured topic and JSON template', () => {
    expect(buildCommandEnvelope({
      deviceNumber: '202111',
      configId: 23,
      topic: 'pump',
      publishTopic: 'command',
      payloadTemplate: '{"mb":"{{mapped_value}}","sn":1,"ack":0,"crc":1,"uart":0}',
      valueMap: '{"on":"010600050001","off":"010600050000"}',
      value: 'on',
    })).toEqual({
      topic: 'command',
      payload: {
        mb: '010600050001',
        sn: 1,
        ack: 0,
        crc: 1,
        uart: 0,
      },
    })
  })

  it('uses the compatible device/direct envelope without a template', () => {
    expect(buildCommandEnvelope({
      deviceNumber: '202111',
      configId: 7,
      topic: 'pump',
      publishTopic: null,
      payloadTemplate: null,
      valueMap: null,
      value: 'off',
    })).toEqual({
      topic: 'device/direct',
      payload: {
        d_no: '202111',
        config_id: 7,
        topic: 'pump',
        value: 'off',
      },
    })
  })
})
