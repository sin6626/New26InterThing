const deviceCommandTopics = new Set([
  'pump',
  'heater',
])

export const isDeviceCommand = (topic: string) => (
  deviceCommandTopics.has(topic)
)
