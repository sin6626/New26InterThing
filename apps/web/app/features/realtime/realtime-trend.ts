import type {
  SensorHistoryTrend,
  SensorHistoryTrendSeries,
  SensorRealtimeData,
} from '@new26interthing/shared'

export type RealtimeTrendKind = 'all' | 'temperature' | 'flow'

export interface RealtimeTrendPoint {
  recordedAt: string
  fields: Record<string, string | number | null>
}

export interface RealtimeTrendMetadata {
  key: string
  name: string
  unit: string
}

const temperatureKeys = new Set(['temp_in', 'temp_out'])
const flowKeys = new Set(['flow_rate'])

const toFiniteNumber = (value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export const toMinuteKey = (value: string) => {
  const matched = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/)
  if (matched) return `${matched[1]} ${matched[2]}:${matched[3]}:00`

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const pad = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:00`
}

const sortAndTrim = (
  points: RealtimeTrendPoint[],
  limit: number,
) => points
  .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
  .slice(-limit)

export const appendRealtimePoint = (
  points: RealtimeTrendPoint[],
  reading: SensorRealtimeData,
  limit = 120,
) => {
  const recordedAt = toMinuteKey(reading.recordedAt)
  if (!recordedAt) return points

  const nextPoint: RealtimeTrendPoint = {
    recordedAt,
    fields: { ...reading.fields },
  }
  const withoutSameMinute = points.filter(point => point.recordedAt !== recordedAt)
  return sortAndTrim([...withoutSameMinute, nextPoint], limit)
}

const historyPoints = (history: SensorHistoryTrend): RealtimeTrendPoint[] => history.times.map((recordedAt, index) => ({
  recordedAt,
  fields: Object.fromEntries(history.series.map(series => [
    series.key,
    series.data[index] ?? null,
  ])),
}))

export const mergeHistoryTrend = (
  history: SensorHistoryTrend,
  realtimePoints: RealtimeTrendPoint[],
  limit: number,
) => {
  const pointsByTime = new Map<string, RealtimeTrendPoint>()

  historyPoints(history).forEach(point => pointsByTime.set(point.recordedAt, point))
  realtimePoints.forEach(point => pointsByTime.set(point.recordedAt, point))

  return {
    metadata: history.series.map(series => ({
      key: series.key,
      name: series.name,
      unit: series.unit,
    })),
    points: sortAndTrim([...pointsByTime.values()], limit),
  }
}

const acceptsKey = (
  key: string,
  kind: RealtimeTrendKind,
) => {
  if (kind === 'temperature') return temperatureKeys.has(key)
  if (kind === 'flow') return flowKeys.has(key)
  return true
}

export const buildRealtimeTrend = (
  points: RealtimeTrendPoint[],
  metadata: RealtimeTrendMetadata[],
  kind: RealtimeTrendKind,
): SensorHistoryTrend => {
  const metadataByKey = new Map(metadata.map(item => [item.key, item]))
  const orderedKeys = [
    ...metadata.map(item => item.key),
    ...points.flatMap(point => Object.keys(point.fields)),
  ].filter((key, index, keys) => keys.indexOf(key) === index)

  const series: SensorHistoryTrendSeries[] = orderedKeys
    .filter(key => acceptsKey(key, kind))
    .filter(key => points.some(point => toFiniteNumber(point.fields[key]) !== null))
    .map((key) => {
      const field = metadataByKey.get(key)
      return {
        key,
        name: field?.name || key,
        unit: field?.unit || '',
        data: points.map(point => toFiniteNumber(point.fields[key])),
      }
    })

  return {
    times: points.map(point => point.recordedAt),
    series,
  }
}
