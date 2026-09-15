import type { HydraulicDiagnosisCode } from '@new26interthing/shared'

interface HydraulicSample {
  time: number
  pressure: number
  flowRate: number
}

interface HydraulicThresholds {
  minSafeFlow: number
  minOperatingPressure: number
  maxSafePressure: number
}

const hasSuddenDrop = (
  samples: HydraulicSample[],
  pressure: number,
  flowRate: number,
) => {
  if (samples.length < 3) return false
  const baseline = samples.slice(0, -1)
  const averagePressure = baseline.reduce((sum, item) => sum + item.pressure, 0) / baseline.length
  const averageFlow = baseline.reduce((sum, item) => sum + item.flowRate, 0) / baseline.length
  if (averagePressure < 30 || averageFlow < 0.6) return false
  return (averagePressure - pressure) / averagePressure >= 0.35
    && averagePressure - pressure >= 20
    && (averageFlow - flowRate) / averageFlow >= 0.35
    && averageFlow - flowRate >= 0.3
}

/** 只给出水力事实结论；持续确认和故障上报由外层负责。 */
export const classifyHydraulicReading = (
  pressure: number,
  flowRate: number,
  samples: HydraulicSample[],
  config: HydraulicThresholds,
): HydraulicDiagnosisCode => {
  if (pressure >= config.maxSafePressure && flowRate < config.minSafeFlow) {
    return 'HYDRAULIC_BLOCKAGE'
  }
  if (hasSuddenDrop(samples, pressure, flowRate)) {
    return 'HYDRAULIC_LEAK_OR_BURST'
  }
  if (flowRate >= config.minSafeFlow) return 'HYDRAULIC_NORMAL'
  return pressure < config.minOperatingPressure
    ? 'HYDRAULIC_PUMP_ABNORMAL'
    : 'HYDRAULIC_SENSOR_ANOMALY'
}
