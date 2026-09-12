const deviceCommandTopics = new Set([
  'master',
  'pump',
  'heater',
])

export const isDeviceCommand = (topic: string) => (
  deviceCommandTopics.has(topic)
)
