import { normalizeAutomationReading } from '../automation/automation-reading.js'
import type { ParsedSensorMessage } from './sensor-message.js'

interface SensorVstatusConfig {
  minSafeFlow: number
  maxSafePressure: number
  maxSafeTemperature: number
}

type LoadConfig = () => Promise<SensorVstatusConfig>

/** 根据当前安全阈值给历史记录计算 vstatus，不依赖设备上报故障字段。 */
export const createSensorVstatusEvaluator = (loadConfig: LoadConfig) => (
  async (message: ParsedSensorMessage): Promise<number> => {
    const config = await loadConfig()
    const reading = normalizeAutomationReading(message.values, Date.now())
    const overTemperature = (
      reading.inletTemperature !== null
      && reading.inletTemperature >= config.maxSafeTemperature
    ) || (
      reading.outletTemperature !== null
      && reading.outletTemperature >= config.maxSafeTemperature
    )
    const overPressure = reading.pressure !== null
      && reading.pressure >= config.maxSafePressure
    const runningLowFlow = reading.actualPump === 'on'
      && reading.flowRate !== null
      && reading.flowRate < config.minSafeFlow

    return overTemperature || overPressure || runningLowFlow ? 1 : 0
  }
)
