/**
 * 阅读导航：水力诊断流程：读取阈值、调用诊断状态、广播结论、故障去重并在泄漏时请求保护；结论与故障入库不是同一步。
 * 入口位置：modules/diagnostics/flows/diagnose.ts
 */

import type {
  AutomationState,
  HydraulicDiagnosis,
  HydraulicDiagnosisCode,
  HydraulicDiagnosisMessage,
} from '@new26interthing/shared'

import type { AutomationReading } from '../../automation/types.js'
import type { MonitoringConfig } from '../../monitoring-config/mysql.js'
import { createHydraulicDiagnosisService } from '../state/confirmation.js'

interface Dependencies {
  loadConfig(): Promise<MonitoringConfig>
  emit(message: HydraulicDiagnosisMessage): void
  protect?(diagnosis: HydraulicDiagnosis): Promise<void>
  reportFault(deviceNumber: string, code: HydraulicDiagnosisCode, detail: string): Promise<void>
}

const reportableCodes = new Set<HydraulicDiagnosisCode>([
  'HYDRAULIC_BLOCKAGE', // 高压 + 低流 堵塞
  'HYDRAULIC_PUMP_ABNORMAL', // 低压 + 低流 水泵空转
  'HYDRAULIC_SENSOR_ANOMALY', // 正常压力 + 低流 疑似流量计异常, 流量计被卡住
  'HYDRAULIC_LEAK_OR_BURST', // 压力 + 流量骤降 水管爆了
])

/**
 * 创建水力诊断模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param options 调用方传入的依赖或业务选项，具体字段见参数的 TypeScript 类型。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createHydraulicDiagnosisManager = ({
  loadConfig,
  emit,
  protect = async () => {},
  reportFault,
}: Dependencies) => {
  /**
   * 管理水力诊断的去重和副作用。
   * 纯规则服务只给结论；本层负责 WebSocket 展示、故障入库和必要的安全停机。
   */
  const service = createHydraulicDiagnosisService()
  const reportedCodes = new Map<string, HydraulicDiagnosisCode>()

  return {
    /**
     * 处理设备的一包实时读数，推进水力诊断状态并返回最新结果。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param reading 已经规范化的本次设备实时读数。
     * @param automationState 设备当前所处的自动水循环状态。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async handleReading(
      deviceNumber: string,
      reading: AutomationReading,
      automationState: AutomationState,
    ) {
      const config = await loadConfig()
      const result = service.evaluate(deviceNumber, {
        pumpRunning: reading.actualPump === 'on',
        buildingFlow: automationState === 'building-flow',
        sensorsValid: reading.pressure !== null
          && Number.isFinite(reading.pressure)
          && reading.flowRate !== null
          && Number.isFinite(reading.flowRate),
        pressure: reading.pressure,
        flowRate: reading.flowRate,
      }, {
        minSafeFlow: config.minSafeFlow,
        minOperatingPressure: config.minOperatingPressure,
        maxSafePressure: config.maxSafePressure,
        confirmSeconds: config.diagnosisConfirmSeconds,
      }, reading.recordedAt)
      emit({
        // 就是Websocket的broadcast因为在runtime层调用的时候传递的就是这个
        type: 'hydraulic.diagnosis',
        data: { deviceNumber, ...result },
      })
      // 仅确定的泄漏/爆管要求紧急停机；其他诊断只上报，不擅自改变设备状态。
      if (result.code === 'HYDRAULIC_LEAK_OR_BURST') {
        await protect({ deviceNumber, ...result })
      }
      if (!reportableCodes.has(result.code)) {
        reportedCodes.delete(deviceNumber)
      }
      else if (reportedCodes.get(deviceNumber) !== result.code) {
        await reportFault(deviceNumber, result.code, result.detail)
        reportedCodes.set(deviceNumber, result.code)
      }
      return result
    },
  }
}
