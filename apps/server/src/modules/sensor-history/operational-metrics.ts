import type { SensorHistoryOperationalMetrics } from '@new26interthing/shared'
import { calculateTemperatureRatePerMinute } from '../operational-metrics/calculation.js'

export interface HistoricalOperationalSample {
  recordedAt: number
  actualPump: 'on' | 'off' | 'unknown'
  actualHeater: 'on' | 'off' | 'unknown'
  outletTemperature: number | null
}

interface CalculationInput {
  deviceNumber: string
  dataTimeoutSeconds: number
  samples: HistoricalOperationalSample[]
  startTime?: number
  endTime?: number
}

const minuteLabel = (timestamp: number) => {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

const dateTimeLabel = (timestamp: number) => {
  const date = new Date(timestamp)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 根据历史采样估算查询区间内的设备运行时长和出口温度变化速度。 */
export const calculateHistoricalOperationalMetrics = ({
  deviceNumber,
  dataTimeoutSeconds,
  samples,
  startTime,
  endTime,
}: CalculationInput): SensorHistoryOperationalMetrics => {
  const ordered = [...samples]
    .filter(sample => Number.isFinite(sample.recordedAt))
    .sort((left, right) => left.recordedAt - right.recordedAt)
  let pumpRuntimeSeconds = 0
  let heaterRuntimeSeconds = 0
  const temperatureWindow: Array<{ recordedAt: number, value: number }> = []
  const rates = new Map<string, number>()

  for (let index = 0; index < ordered.length; index += 1) {
    const sample = ordered[index]!
    const previous = ordered[index - 1]
    if (previous && sample.recordedAt > previous.recordedAt) {
      const intervalStart = Math.max(previous.recordedAt, startTime ?? previous.recordedAt)
      const intervalEnd = Math.min(sample.recordedAt, endTime ?? sample.recordedAt)
      const rawElapsedSeconds = (sample.recordedAt - previous.recordedAt) / 1_000
      const includedSeconds = Math.max(0, (intervalEnd - intervalStart) / 1_000)
      if (rawElapsedSeconds <= dataTimeoutSeconds && includedSeconds > 0) {
        if (sample.actualPump === 'on') pumpRuntimeSeconds += includedSeconds
        if (sample.actualHeater === 'on') heaterRuntimeSeconds += includedSeconds
      }
    }

    if (
      sample.outletTemperature === null
      || !Number.isFinite(sample.outletTemperature)
    ) continue

    temperatureWindow.push({
      recordedAt: sample.recordedAt,
      value: sample.outletTemperature,
    })
    while (
      temperatureWindow[0]
      && sample.recordedAt - temperatureWindow[0].recordedAt > 60_000
    ) temperatureWindow.shift()

    if (
      (startTime === undefined || sample.recordedAt >= startTime)
      && (endTime === undefined || sample.recordedAt <= endTime)
    ) {
      const oldest = temperatureWindow[0]
      const rate = calculateTemperatureRatePerMinute(oldest, {
        recordedAt: sample.recordedAt,
        value: sample.outletTemperature,
      })
      if (rate !== null) rates.set(minuteLabel(sample.recordedAt), rate)
    }
  }

  return {
    deviceNumber,
    startTime: startTime === undefined
      ? (ordered[0] ? dateTimeLabel(ordered[0].recordedAt) : null)
      : dateTimeLabel(startTime),
    endTime: endTime === undefined
      ? (ordered.at(-1) ? dateTimeLabel(ordered.at(-1)!.recordedAt) : null)
      : dateTimeLabel(endTime),
    pumpRuntimeSeconds: Number(pumpRuntimeSeconds.toFixed(1)),
    heaterRuntimeSeconds: Number(heaterRuntimeSeconds.toFixed(1)),
    outletTemperatureRate: {
      times: [...rates.keys()],
      data: [...rates.values()],
    },
  }
}
