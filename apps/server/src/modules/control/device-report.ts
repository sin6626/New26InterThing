export const parseDeviceReport = (payload: Buffer) => {
  let data: unknown
  try {
    data = JSON.parse(payload.toString('utf8'))
  }
  catch {
    throw new Error('设备指令上报 JSON 解析失败')
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('设备指令上报必须是 JSON 对象')
  }
  const record = data as Record<string, unknown>
  const deviceNumber = String(record.d_no || '').trim()
  const configId = Number(record.config_id)
  const rawValue = String(record.value ?? '').trim()
  const value = rawValue.includes(' ') ? rawValue.split(/\s+/).at(-1) || '' : rawValue
  if (!deviceNumber || !Number.isInteger(configId) || !value) {
    throw new Error('设备指令上报缺少 d_no、config_id 或 value')
  }
  return {
    deviceNumber,
    configId,
    value,
  }
}
