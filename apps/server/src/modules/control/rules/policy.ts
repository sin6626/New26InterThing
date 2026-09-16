/**
 * 阅读导航：指令发布策略：目前只有 pump、heater 是设备运行命令；其他后台参数保存后供状态机读取，不因为有 publish_topic 就盲目发送。
 * 入口位置：modules/control/rules/policy.ts
 */

const deviceCommandTopics = new Set([
  'pump',
  'heater',
])

/**
 * 判断指令控制当前是否满足对应业务条件；本函数不主动执行外部操作。
 * @param topic 控制配置使用的业务主题，例如 master、pump 或 heater。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const isDeviceCommand = (topic: string) => (
  deviceCommandTopics.has(topic)
)
