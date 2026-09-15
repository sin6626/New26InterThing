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
  'HYDRAULIC_BLOCKAGE',
  'HYDRAULIC_PUMP_ABNORMAL',
  'HYDRAULIC_SENSOR_ANOMALY',
  'HYDRAULIC_LEAK_OR_BURST',
])

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
    async handleReading(
      deviceNumber: string,
      reading: AutomationReading,
      automationState: AutomationState,
    ) {
      const config = await loadConfig()
      const result = service.evaluate(deviceNumber, {
        pumpRunning: reading.actualPump === 'on',
        buildingFlow: automationState === 'building-flow',
        sensorsValid: reading.pressure !== null && reading.flowRate !== null,
        pressure: reading.pressure,
        flowRate: reading.flowRate,
      }, {
        minSafeFlow: config.minSafeFlow,
        minOperatingPressure: config.minOperatingPressure,
        maxSafePressure: config.maxSafePressure,
        confirmSeconds: config.diagnosisConfirmSeconds,
      }, reading.recordedAt)
      emit({
        type: 'hydraulic.diagnosis',
        data: { deviceNumber, ...result },
      })
      await protect({ deviceNumber, ...result })
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
