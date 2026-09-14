export interface ParsedSensorMessage {
  deviceNumber: string
  recordedAt: string
  dataKind: 'realtime' | 'backfill'
  values: Record<string, string | number | null>
}

export type SensorMessageParseResult =
  | { accepted: true; message: ParsedSensorMessage }
  | { accepted: false; reason: string }

const reservedFields = new Set(['d_no', 'c_time', 'time', 'online', 'vstatus'])

const formatDateTime = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
}

export const parseSensorMessage = (
  topic: string,
  payload: Buffer,
  now = new Date(),
): SensorMessageParseResult => {
  if (topic !== 'device/sensor') {
    return { accepted: false, reason: '不支持的主题' }
  }

  let data: unknown
  try {
    data = JSON.parse(payload.toString('utf8'))
  } catch {
    return { accepted: false, reason: 'JSON解析失败' }
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { accepted: false, reason: 'JSON必须是对象' }
  }

  const record = data as Record<string, unknown>
  const deviceNumber = typeof record.d_no === 'string' ? record.d_no.trim() : ''
  if (!deviceNumber) {
    return { accepted: false, reason: '缺少d_no' }
  }

  const values = Object.fromEntries(
    Object.entries(record).filter(
      ([key, value]) =>
        !reservedFields.has(key) &&
        (typeof value === 'string' || typeof value === 'number' || value === null),
    ),
  ) as Record<string, string | number | null>

  if (Object.keys(values).length === 0) {
    return { accepted: false, reason: '没有传感器字段' }
  }

  const reportedTime = record.c_time ?? record.time
  const recordedAt =
    typeof reportedTime === 'string' && reportedTime.trim()
      ? reportedTime.trim()
      : formatDateTime(now)

  return {
    accepted: true,
    message: {
      deviceNumber,
      recordedAt,
      dataKind: String(record.online) === '1' ? 'backfill' : 'realtime',
      values,
    },
  }
}
