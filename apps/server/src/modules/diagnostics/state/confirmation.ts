/**
 * 阅读导航：水力确认状态：保存近时段样本与候选故障起点，立即规则和持续确认规则在这里排序；防止一次噪声就入库。
 * 入口位置：modules/diagnostics/state/confirmation.ts
 */

import type {
  HydraulicDiagnosis,
  HydraulicDiagnosisCode,
} from '@new26interthing/shared'
import { classifyHydraulicReading } from '../rules/hydraulic.js'

type DiagnosisResult = Omit<HydraulicDiagnosis, 'deviceNumber'>

interface HydraulicFacts {
  pumpRunning: boolean // 水泵当前是否在运转
  buildingFlow: boolean // 是否处理建流时期
  sensorsValid: boolean // 传感器是否有效
  pressure: number | null
  flowRate: number | null
}

interface HydraulicConfig {
  minSafeFlow: number
  minOperatingPressure: number
  maxSafePressure: number
  confirmSeconds: number // 确认的持续时间(水压联合诊断就是看这个时间)
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

/**
 * 根据压力、流量和变化趋势计算当前水力联合诊断结论。
 * @param code 系统内部使用的故障语义编码。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const diagnosis = (code: HydraulicDiagnosisCode): DiagnosisResult => ({
  code,
  ...definitions[code],
})
// 单个采样点
interface Sample { time: number; pressure: number; flowRate: number }
// 给下方算法用的, 好复杂不想看
interface State {
  candidate: HydraulicDiagnosisCode | null // 正在观察中的"候选异常"
  candidateSince: number // 候选异常首次出现的时间戳
  active: DiagnosisResult // 结果
  samples: Sample[] // 采样点
}

/** 根据水泵状态、压力与流量组合判断堵塞、空转、传感器异常和泄漏。 */
export const createHydraulicDiagnosisService = () => {
  const states = new Map<string, State>()
  /**
   * 取得指定设备的诊断确认状态；首次访问时创建默认状态。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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
    /**
     * 推进诊断确认窗口，只在同一异常持续足够时间后输出正式结论。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param facts 本次判断依赖的实时传感器与状态事实。
     * @param config 从后台配置读取并校验后的业务参数。
     * @param now 当前服务器时间戳，单位为毫秒。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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
      const candidate = classifyHydraulicReading(
        facts.pressure,
        facts.flowRate,
        state.samples,
        config,
      )
      if (candidate === 'HYDRAULIC_BLOCKAGE') {
        return (state.active = diagnosis('HYDRAULIC_BLOCKAGE'))
      }
      if (candidate === 'HYDRAULIC_LEAK_OR_BURST') {
        return (state.active = diagnosis('HYDRAULIC_LEAK_OR_BURST'))
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
    /**
     * 返回指定设备当前快照，供 HTTP 查询或 WebSocket 展示。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    getSnapshot(deviceNumber: string) {
      return stateFor(deviceNumber).active
    },
  }
}
