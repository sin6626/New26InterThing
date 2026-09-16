/**
 * 阅读导航：传感器上行报文解析：识别 d_no、时间与 online；当前实现将 online=1 视作补发，其余视作实时，并剔除非传感器字段。
 * 入口位置：modules/realtime/adapters/sensor-message.ts
 */

export interface ParsedSensorMessage {
  deviceNumber: string
  recordedAt: string
  dataKind: 'realtime' | 'backfill'
  values: Record<string, string | number | null>
}

export type SensorMessageParseResult =
  | { accepted: true; message: ParsedSensorMessage }
  | { accepted: false; reason: string }

  // 隔离出系统层数据的名单
const reservedFields = new Set(['d_no', 'c_time', 'time', 'online', 'vstatus'])

/**
 * 把时间值转换成数据库和页面统一使用的本地日期时间字符串。
 * @param date 需要格式化或同步的日期时间对象。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const formatDateTime = (date: Date) => {
  /**
   * 把单个时间数字补齐为两位字符串，供日期时间格式化复用。
   * @param value 本次准备读取、转换或保存的值。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const pad = (value: number) => String(value).padStart(2, '0')
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(' ')
}

/**
 * 校验 device/sensor JSON，并把 online=0 解释为实时、online=1 解释为断网补发。
 * 其他 Topic 或缺少 d_no 的消息在这里明确拒绝。
 * 主要就是对数据进行解析, 主题不对或者解析, 少d_no都认为错误
 */
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
    // d_no、时间、online、vstatus 是报文元数据，不是后台传感器字段映射的读数。
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
  // 历史表保留设备声称的采样时间；自动控制另用后端接收时间判断新鲜度。
  const recordedAt =
    typeof reportedTime === 'string' && reportedTime.trim()
      ? reportedTime.trim()
      : formatDateTime(now)

  return {
    accepted: true,
    message: {
      deviceNumber,
      recordedAt,
      // 当前协议仅把 online=1 认作补发，其余值按实时处理；现场必须核对设备是否只发 0/1。
      dataKind: String(record.online) === '1' ? 'backfill' : 'realtime',
      values,
    },
  }
}
