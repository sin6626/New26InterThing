export const FAULT_TOPIC = 'device/error'

export interface FaultMessage {
  deviceNumber: string
  errorNumber: string
  type: string
  message?: string
  occurredAt: string | Date
}

export type FaultMessageResult =
  | { accepted: true; message: FaultMessage }
  | { accepted: false; reason: string }

const requiredText = (value: unknown) => {
  if (typeof value !== 'string' && typeof value !== 'number') return null
  const text = String(value).trim()
  return text || null
}

export const parseFaultMessage = (
  topic: string,
  payload: Buffer,
  now: () => Date = () => new Date(),
): FaultMessageResult => {
  if (topic !== FAULT_TOPIC) return { accepted: false, reason: `不支持的 Topic：${topic}` }

  let data: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(payload.toString('utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { accepted: false, reason: '故障消息必须是 JSON 对象' }
    }
    data = parsed as Record<string, unknown>
  } catch {
    return { accepted: false, reason: '故障消息不是合法 JSON' }
  }

  const deviceNumber = requiredText(data.d_no)
  const errorNumber = requiredText(data.e_no)
  const type = requiredText(data.type)
  if (!deviceNumber) return { accepted: false, reason: '故障消息缺少 d_no' }
  if (!errorNumber) return { accepted: false, reason: '故障消息缺少 e_no' }
  if (!type) return { accepted: false, reason: '故障消息缺少 type' }

  const occurredAt = requiredText(data.c_time) || requiredText(data.time) || now()
  const message = requiredText(data.e_msg) || undefined
  return {
    accepted: true,
    message: { deviceNumber, errorNumber, type, message, occurredAt },
  }
}
