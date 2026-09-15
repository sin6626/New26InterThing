/** 实时包的派生链路；补发包不会调用这里，避免旧数据驱动设备。 */
import { normalizeAutomationReading } from '../modules/automation/index.js'
import type { createAutomationManager } from '../modules/automation/index.js'
import type { createHydraulicDiagnosisManager } from '../modules/diagnostics/index.js'
import type { createOperationalMetricsService } from '../modules/operational-metrics/index.js'
import type { ParsedSensorMessage } from '../modules/realtime/adapters/sensor-message.js'
import type { createWaterFlowService } from '../modules/water-flow/index.js'
import type { createRealtimeWebSocket } from '../infrastructure/websocket/realtime-websocket.js'

interface Dependencies {
  automation: ReturnType<typeof createAutomationManager>
  hydraulicDiagnosis: ReturnType<typeof createHydraulicDiagnosisManager>
  operationalMetrics: ReturnType<typeof createOperationalMetricsService>
  waterFlow: ReturnType<typeof createWaterFlowService>
  websocket: ReturnType<typeof createRealtimeWebSocket>
}

export function createRealtimeConsumers({
  automation,
  hydraulicDiagnosis,
  operationalMetrics,
  waterFlow,
  websocket,
}: Dependencies) {
  return [
    async (message: ParsedSensorMessage) => {
      // 安全判断只使用后端接收时间，不信任设备报文中可能过期的采样时间。
      const receivedAt = Date.now()
      const reading = normalizeAutomationReading(message.values, receivedAt)
      const metrics = await operationalMetrics.handleReading(message.deviceNumber, reading)
      websocket.broadcast({ type: 'operational-metrics.realtime', data: metrics })

      if (reading.flowRate !== null && reading.flowRate >= 0) {
        const snapshot = await waterFlow.handleReading(
          message.deviceNumber,
          reading.flowRate,
          receivedAt,
        )
        websocket.broadcast({ type: 'water-flow.realtime', data: snapshot })
      }
      await automation.handleReading(message.deviceNumber, reading)
    },
    async (message: ParsedSensorMessage) => {
      // 诊断使用同一设备的自动状态快照，但不改写历史传感器记录。
      const reading = normalizeAutomationReading(message.values, Date.now())
      const snapshot = await automation.getSnapshot(message.deviceNumber)
      await hydraulicDiagnosis.handleReading(
        message.deviceNumber,
        reading,
        snapshot.state,
      )
    },
  ]
}
