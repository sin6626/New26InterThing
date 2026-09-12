import type {
  SensorHistoryTrend,
  SensorRealtimeData,
} from '@new26interthing/shared'
import {
  describe,
  expect,
  it,
} from 'vitest'

import {
  appendRealtimePoint,
  buildRealtimeTrend,
  mergeHistoryTrend,
} from '../app/features/realtime/realtime-trend'

const reading = (
  deviceNumber: string,
  recordedAt: string,
  fields: SensorRealtimeData['fields'],
): SensorRealtimeData => ({
  deviceNumber,
  recordedAt,
  fields,
})

describe('realtime trend window', () => {
  it('keeps devices isolated and replaces repeated minute points', () => {
    const first = appendRealtimePoint([], reading('A', '2026-09-12 10:00:10', {
      temp_in: 20,
    }))
    const replaced = appendRealtimePoint(first, reading('A', '2026-09-12 10:00:50', {
      temp_in: 21,
    }))

    expect(replaced).toEqual([{
      recordedAt: '2026-09-12 10:00:00',
      fields: { temp_in: 21 },
    }])
  })

  it('sorts points and trims the oldest values to the selected limit', () => {
    let points = appendRealtimePoint([], reading('A', '2026-09-12 10:02:00', { flow_rate: 2 }), 2)
    points = appendRealtimePoint(points, reading('A', '2026-09-12 10:00:00', { flow_rate: 0 }), 2)
    points = appendRealtimePoint(points, reading('A', '2026-09-12 10:01:00', { flow_rate: 1 }), 2)

    expect(points.map(point => point.recordedAt)).toEqual([
      '2026-09-12 10:01:00',
      '2026-09-12 10:02:00',
    ])
  })

  it('merges history with realtime and lets realtime win for the same minute', () => {
    const history: SensorHistoryTrend = {
      times: ['2026-09-12 10:00:00', '2026-09-12 10:01:00'],
      series: [{
        key: 'temp_in',
        name: '入口温度',
        unit: '℃',
        data: [20, 21],
      }],
    }
    const result = mergeHistoryTrend(history, [{
      recordedAt: '2026-09-12 10:01:00',
      fields: { temp_in: 22 },
    }], 60)

    expect(result.points[1]?.fields.temp_in).toBe(22)
  })

  it('builds all, temperature, and flow series without treating text as numbers', () => {
    const points = [{
      recordedAt: '2026-09-12 10:00:00',
      fields: {
        temp_in: 0,
        temp_out: '22.5',
        flow_rate: 1.2,
        pressure: 100,
        state: 'running',
        invalid: 'Infinity',
      },
    }]
    const metadata = [
      { key: 'temp_in', name: '入口温度', unit: '℃' },
      { key: 'temp_out', name: '出口温度', unit: '℃' },
      { key: 'flow_rate', name: '流量', unit: 'L/min' },
      { key: 'pressure', name: '压力', unit: 'kPa' },
    ]

    expect(buildRealtimeTrend(points, metadata, 'all').series.map(item => item.key)).toEqual([
      'temp_in',
      'temp_out',
      'flow_rate',
      'pressure',
    ])
    expect(buildRealtimeTrend(points, metadata, 'temperature').series.map(item => item.key)).toEqual([
      'temp_in',
      'temp_out',
    ])
    expect(buildRealtimeTrend(points, metadata, 'flow').series.map(item => item.key)).toEqual([
      'flow_rate',
    ])
  })
})
