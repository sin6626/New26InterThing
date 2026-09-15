/**
 * 阅读导航：历史数据状态规则：用当前后台安全阈值给传感器记录标记正常或异常；调试模式不能修改历史事实。
 * 入口位置：modules/realtime/rules/vstatus.ts
 */

import { normalizeAutomationReading } from '../../automation/adapters/reading.js'
import type { ParsedSensorMessage } from '../adapters/sensor-message.js'

interface SensorVstatusConfig {
  minSafeFlow: number
  maxSafePressure: number
  maxSafeTemperature: number
}

type LoadConfig = () => Promise<SensorVstatusConfig>

/** 根据当前安全阈值给历史记录计算 vstatus，不依赖设备上报故障字段。 */
// 很简单的处理而已, 没有超过阈值就认为是正常的数据(残留逻辑, 不用删, 可兼容)
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
