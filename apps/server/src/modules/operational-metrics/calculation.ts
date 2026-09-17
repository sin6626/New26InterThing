interface TemperatureSample {
  recordedAt: number
  value: number
}

/** 使用窗口最早点和当前点计算统一的每分钟温度变化速度。 */
export const calculateTemperatureRatePerMinute = (
  oldest: TemperatureSample | undefined,
  current: TemperatureSample,
) => {
  if (!oldest) return null
  const elapsedSeconds = (current.recordedAt - oldest.recordedAt) / 1_000
  if (elapsedSeconds < 5) return null
  return Number((((current.value - oldest.value) / elapsedSeconds) * 60).toFixed(2))
}
