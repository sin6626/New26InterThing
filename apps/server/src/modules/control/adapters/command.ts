/**
 * 阅读导航：指令协议适配：按数据库 publish_topic、value_map、payload_template 形成最终 MQTT topic/payload；页面 on/off 不一定是设备真正认识的 mb。
 * 入口位置：modules/control/adapters/command.ts
 * 把发送的指令转换为设备端需要的格式
 */

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

// 根据开关on/off 正确的映射成为他们设备端能识别的指令
const replaceTemplate = (
  value: unknown,
  context: Record<string, unknown>,
): unknown => {
  // 模板中整个值就是 {{mapped_value}} 时，保留映射值原本的数字/布尔类型；
  // 只有嵌在普通字符串里时才转换为字符串。这影响设备收到的 JSON 类型。
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
  // 例：后台 value_map 把 pump=on 映射成 Modbus mb，模板再生成
  // {mb, sn, ack, crc, uart}；最终 topic 可能是 team/command 而非默认主题。
  const valueMap = parseObject(definition.valueMap, 'value_map')
  const mappedValue = valueMap && Object.hasOwn(valueMap, definition.value) // hasOwn判断对象上有没有一个属性, in检查原型链, hasOwn不会
    ? valueMap[definition.value]
    : definition.value
  // 主题的替换, 如果指令有定义主题, 那么就替换, 否则就是兜底主题
  const topic = definition.publishTopic?.trim() || 'device/direct'
  const template = parseObject(definition.payloadTemplate, 'payload_template')

  if (!template) {
    // 没有自定义模板时使用旧项目兼容的通用 direct 格式；
    // 这里仍保存页面规范化后的原始 value，不把 value_map 偷偷代进去。
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
