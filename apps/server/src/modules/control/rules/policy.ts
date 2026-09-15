/**
 * 阅读导航：指令发布策略：目前只有 pump、heater 是设备运行命令；其他后台参数保存后供状态机读取，不因为有 publish_topic 就盲目发送。
 * 入口位置：modules/control/rules/policy.ts
 */

const deviceCommandTopics = new Set([
  'pump',
  'heater',
])

export const isDeviceCommand = (topic: string) => (
  deviceCommandTopics.has(topic)
)
