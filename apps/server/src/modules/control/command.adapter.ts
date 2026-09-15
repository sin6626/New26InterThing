interface CommandDefinition {
  deviceNumber: string
  configId: number
  topic: string
  publishTopic: string | null
  payloadTemplate: string | null
  valueMap: string | null
  value: string
}

const parseObject = (
  value: string | null,
  name: string,
) => {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error()
    }
    return parsed as Record<string, unknown>
  }
  catch {
    throw new Error(`${name} 不是合法的 JSON 对象`)
  }
}

const replaceTemplate = (
  value: unknown,
  context: Record<string, unknown>,
): unknown => {
  if (typeof value === 'string') {
    const exact = /^\{\{\s*([a-zA-Z0-9_]+)\s*\}\}$/.exec(value)
    if (exact) return context[exact[1] || '']
    return value.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) => String(context[key] ?? ''))
  }
  if (Array.isArray(value)) return value.map(item => replaceTemplate(item, context))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTemplate(item, context)]))
  }
  return value
}

/** 把数据库中的控制定义转换成旧设备仍能识别的 MQTT 指令信封。 */
export const buildCommandEnvelope = (definition: CommandDefinition) => {
  const valueMap = parseObject(definition.valueMap, 'value_map')
  const mappedValue = valueMap && Object.hasOwn(valueMap, definition.value)
    ? valueMap[definition.value]
    : definition.value
  const topic = definition.publishTopic?.trim() || 'device/direct'
  const template = parseObject(definition.payloadTemplate, 'payload_template')

  if (!template) {
    return {
      topic,
      payload: {
        d_no: definition.deviceNumber,
        config_id: definition.configId,
        topic: definition.topic,
        value: definition.value,
      },
    }
  }

  return {
    topic,
    payload: replaceTemplate(template, {
      d_no: definition.deviceNumber,
      config_id: definition.configId,
      topic: definition.topic,
      value: definition.value,
      mapped_value: mappedValue,
    }) as Record<string, unknown>,
  }
}
