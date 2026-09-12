import type {
  ControlSnapshot,
  OperationLogOptions,
  OperationLogQuery,
  PaginatedOperationLogs,
} from '@new26interthing/shared'

export interface ControlDefinition {
  configId: number
  name: string
  fieldType: string
  topic: string
  publishTopic: string | null
  payloadTemplate: string | null
  valueMap: string | null
  min: string | null
  max: string | null
  options: unknown
  oldValue: string | null
}

export interface ControlRepository {
  getSnapshot(deviceNumber: string): Promise<ControlSnapshot>
  getDefinition(deviceNumber: string, configId: number): Promise<ControlDefinition | null>
  saveSuccess(definition: ControlDefinition, deviceNumber: string, value: string, remark: string): Promise<void>
  saveFailure(definition: ControlDefinition, deviceNumber: string, value: string, remark: string): Promise<void>
  applyDeviceReport(deviceNumber: string, configId: number, value: string): Promise<void>
  saveTimeSync(deviceNumber: string, value: string, result: string, remark: string): Promise<void>
  getLogOptions(): Promise<OperationLogOptions>
  listLogs(query: OperationLogQuery): Promise<Omit<PaginatedOperationLogs, 'page' | 'pageSize'>>
}
