/**
 * 阅读导航：水力纯规则：用压力与流量组合识别堵塞、泵异常、传感器异常和骤降泄漏；不维护时间窗口或发布告警。
 * 入口位置：modules/diagnostics/rules/hydraulic.ts
 */

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
  // 至少三点才能把最近读数与前面一段较稳定的基线比较，降低偶发噪声误报。
  const baseline = samples.slice(0, -1)
  const averagePressure = baseline.reduce((sum, item) => sum + item.pressure, 0) / baseline.length
  const averageFlow = baseline.reduce((sum, item) => sum + item.flowRate, 0) / baseline.length
  if (averagePressure < 30 || averageFlow < 0.6) return false
  // 本来就接近零的压力/流量不适合按百分比判“骤降”。
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
    // 超压且缺流优先解释为阻塞；这个立即风险高于后面的缓慢原因确认。
    return 'HYDRAULIC_BLOCKAGE'
  }
  if (hasSuddenDrop(samples, pressure, flowRate)) {
    // 压力与流量同时显著下降才提示脱落/严重泄漏，而非仅凭低流量猜测。
    return 'HYDRAULIC_LEAK_OR_BURST'
  }
  if (flowRate >= config.minSafeFlow) return 'HYDRAULIC_NORMAL'
  return pressure < config.minOperatingPressure
    ? 'HYDRAULIC_PUMP_ABNORMAL'
    : 'HYDRAULIC_SENSOR_ANOMALY'
}
