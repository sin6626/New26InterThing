import type {
  HydraulicDiagnosis,
  HydraulicDiagnosisCode,
} from '@new26interthing/shared'

type DiagnosisResult = Omit<HydraulicDiagnosis, 'deviceNumber'>

interface HydraulicFacts {
  pumpRunning: boolean
  buildingFlow: boolean
  sensorsValid: boolean
  pressure: number | null
  flowRate: number | null
}

interface HydraulicConfig {
  minSafeFlow: number
  minOperatingPressure: number
  maxSafePressure: number
  confirmSeconds: number
}

const definitions: Record<HydraulicDiagnosisCode, Omit<DiagnosisResult, 'code'>> = {
  STOPPED: { name: '系统已停止', detail: '水泵未运行，不进行水力状态诊断', level: 'info' },
  BUILDING_FLOW: { name: '正在建流', detail: '水泵正在建立循环流量，处于允许建立缓冲期', level: 'info' },
  SENSOR_INVALID: { name: '传感器数据无效', detail: '压力或流量传感器数据无效，暂缓原因诊断', level: 'warning' },
  HYDRAULIC_NORMAL: { name: '水力运行正常', detail: '压力与流量处于正常安全工作区间', level: 'success' },
  HYDRAULIC_BLOCKAGE: { name: '疑似管路堵塞', detail: '管路超压且流量不足，疑似出口阻力过大或严重堵塞', level: 'error' },
  HYDRAULIC_PUMP_ABNORMAL: { name: '疑似泵送异常', detail: '压力与流量均偏低，疑似缺水、吸水口进气或水泵空转', level: 'error' },
  HYDRAULIC_SENSOR_ANOMALY: { name: '疑似流量传感器异常', detail: '管路压力正常但流量偏低，疑似流量计卡阻或信号异常', level: 'warning' },
  HYDRAULIC_LEAK_OR_BURST: { name: '疑似管路脱落或严重泄漏', detail: '平稳运行中压力与流量同步骤降', level: 'error' },
}

const diagnosis = (code: HydraulicDiagnosisCode): DiagnosisResult => ({
  code,
  ...definitions[code],
})

interface Sample { time: number; pressure: number; flowRate: number }
interface State {
  candidate: HydraulicDiagnosisCode | null
  candidateSince: number
  active: DiagnosisResult
  samples: Sample[]
}

const suddenDrop = (samples: Sample[], pressure: number, flowRate: number) => {
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

export const createHydraulicDiagnosisService = () => {
  const states = new Map<string, State>()
  const stateFor = (deviceNumber: string) => {
    const existing = states.get(deviceNumber)
    if (existing) return existing
    const created: State = {
      candidate: null,
      candidateSince: 0,
      active: diagnosis('STOPPED'),
      samples: [],
    }
    states.set(deviceNumber, created)
    return created
  }

  return {
    evaluate(
      deviceNumber: string,
      facts: HydraulicFacts,
      config: HydraulicConfig,
      now = Date.now(),
    ) {
      const state = stateFor(deviceNumber)
      if (!facts.pumpRunning) {
        state.candidate = null
        state.samples = []
        return (state.active = diagnosis('STOPPED'))
      }
      if (!facts.sensorsValid || facts.pressure === null || facts.flowRate === null) {
        state.candidate = null
        return (state.active = diagnosis('SENSOR_INVALID'))
      }
      if (facts.buildingFlow) {
        state.candidate = null
        return (state.active = diagnosis('BUILDING_FLOW'))
      }

      state.samples.push({ time: now, pressure: facts.pressure, flowRate: facts.flowRate })
      state.samples = state.samples.filter(sample => now - sample.time <= 8_000)
      if (facts.pressure >= config.maxSafePressure && facts.flowRate < config.minSafeFlow) {
        return (state.active = diagnosis('HYDRAULIC_BLOCKAGE'))
      }
      if (suddenDrop(state.samples, facts.pressure, facts.flowRate)) {
        return (state.active = diagnosis('HYDRAULIC_LEAK_OR_BURST'))
      }

      let candidate: HydraulicDiagnosisCode = 'HYDRAULIC_NORMAL'
      if (facts.flowRate < config.minSafeFlow) {
        candidate = facts.pressure < config.minOperatingPressure
          ? 'HYDRAULIC_PUMP_ABNORMAL'
          : 'HYDRAULIC_SENSOR_ANOMALY'
      }
      if (candidate === 'HYDRAULIC_NORMAL') {
        state.candidate = null
        return (state.active = diagnosis(candidate))
      }
      if (state.candidate !== candidate) {
        state.candidate = candidate
        state.candidateSince = now
        state.active = diagnosis('HYDRAULIC_NORMAL')
        return state.active
      }
      if (now - state.candidateSince >= config.confirmSeconds * 1_000) {
        state.active = diagnosis(candidate)
      }
      return state.active
    },
    getSnapshot(deviceNumber: string) {
      return stateFor(deviceNumber).active
    },
  }
}
