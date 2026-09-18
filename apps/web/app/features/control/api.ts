import type {
  ApiResponse,
  ControlCommandIntent,
  ControlCommandResult,
  ForceControlOffIntent,
  ControlSnapshot,
  OperationLogOptions,
  OperationLogQuery,
  OperationalMetricsSnapshot,
  PaginatedOperationLogs,
  AutomationSnapshot,
  AutomationDebugMode,
  FaultRuleConfig,
  UpdateFaultRuleConfig,
  WaterFlowSnapshot,
} from '@new26interthing/shared'

import { createHttpClient } from '~/utils/http'

const unwrap = <T>(response: ApiResponse<T>) => {
  if (response.code !== 0 || response.data === null) {
    throw new Error(response.message)
  }
  return response.data
}

export const useControlApi = () => {
  const config = useRuntimeConfig()
  const http = createHttpClient(config.public.apiBase)
  return {
    async getSnapshot(deviceNumber: string) {
      const response = await http.get<ApiResponse<ControlSnapshot>>(
        `/controls/${encodeURIComponent(deviceNumber)}`,
      )
      return unwrap(response.data)
    },
    async getAutomationSnapshot(deviceNumber: string) {
      const response = await http.get<ApiResponse<AutomationSnapshot>>(
        `/automation/${encodeURIComponent(deviceNumber)}`,
      )
      return unwrap(response.data)
    },
    async getDebugMode() {
      const response = await http.get<ApiResponse<AutomationDebugMode>>(
        '/automation/debug-mode',
      )
      return unwrap(response.data)
    },
    async setDebugMode(enabled: boolean) {
      const response = await http.post<ApiResponse<AutomationDebugMode>>(
        '/automation/debug-mode',
        { enabled },
      )
      return unwrap(response.data)
    },
    async getOperationalMetrics(deviceNumber: string) {
      const response = await http.get<ApiResponse<OperationalMetricsSnapshot>>(
        `/automation/${encodeURIComponent(deviceNumber)}/operational-metrics`,
      )
      return unwrap(response.data)
    },
    async resetWaterFlow(deviceNumber: string) {
      const response = await http.post<ApiResponse<WaterFlowSnapshot>>(
        `/automation/${encodeURIComponent(deviceNumber)}/water-flow/reset`,
      )
      return unwrap(response.data)
    },
    async resetOperationalMetrics(deviceNumber: string) {
      const response = await http.post<ApiResponse<OperationalMetricsSnapshot>>(
        `/automation/${encodeURIComponent(deviceNumber)}/operational-metrics/reset`,
      )
      return unwrap(response.data)
    },
    async resetAutomationFault(deviceNumber: string) {
      const response = await http.post<ApiResponse<AutomationSnapshot>>(
        `/automation/${encodeURIComponent(deviceNumber)}/fault/reset`,
      )
      return unwrap(response.data)
    },
    async execute(intent: ControlCommandIntent) {
      const response = await http.post<ApiResponse<ControlCommandResult>>(
        '/controls/commands',
        intent,
      )
      return unwrap(response.data)
    },
    async forceOff(intent: ForceControlOffIntent) {
      const response = await http.post<ApiResponse<ControlCommandResult>>(
        '/controls/commands/force-off',
        intent,
      )
      return unwrap(response.data)
    },
    async syncTime(deviceNumber: string, time?: string) {
      const response = await http.post<ApiResponse<{ value: string, status: 'published' }>>(
        '/controls/time-sync',
        { deviceNumber, time },
      )
      return unwrap(response.data)
    },
    async getLogOptions() {
      const response = await http.get<ApiResponse<OperationLogOptions>>(
        '/operation-logs/options',
      )
      return unwrap(response.data)
    },
    async getFaultRules() {
      const response = await http.get<ApiResponse<FaultRuleConfig[]>>('/fault-rules')
      return unwrap(response.data)
    },
    async updateFaultRule(faultCode: string, input: UpdateFaultRuleConfig) {
      const response = await http.put<ApiResponse<FaultRuleConfig>>(
        `/fault-rules/${encodeURIComponent(faultCode)}`,
        input,
      )
      return unwrap(response.data)
    },
    async getLogs(query: OperationLogQuery) {
      const response = await http.get<ApiResponse<PaginatedOperationLogs>>(
        '/operation-logs',
        { params: query },
      )
      return unwrap(response.data)
    },
  }
}
