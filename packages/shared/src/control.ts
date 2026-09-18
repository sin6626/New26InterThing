export type ControlFieldType = 'switch' | 'input' | 'slider' | 'datetime' | 'radio' | 'checkbox'

export interface ControlOption {
  label: string
  value: string
}

export interface ControlField {
  configId: number
  parentId: number | null
  parentValue: string | null
  name: string
  type: ControlFieldType | 'unsupported'
  min: number | null
  max: number | null
  options: ControlOption[]
  topic: string
  actionKind: 'command' | 'parameter'
  value: string | null
  heaterStartBlocked: boolean
  automaticStartBlocked: boolean
}

export interface ControlSnapshot {
  deviceNumber: string
  fields: ControlField[]
}

export interface ControlCommandIntent {
  deviceNumber: string
  configId: number
  value: string | number | boolean | string[]
}

export interface ForceControlOffIntent {
  deviceNumber: string
  configId: number
}

export interface ControlCommandResult {
  configId: number
  value: string
  status: 'published' | 'saved' | 'unchanged'
}

export interface OperationLogItem {
  id: number
  operatedAt: string
  deviceNumber: string | null
  configId: number | null
  commandName: string | null
  commandType: string
  oldValue: string | null
  newValue: string | null
  result: string
  source: 'application' | 'device' | 'recognition'
}

export interface OperationLogQuery {
  page: number
  pageSize: number
  deviceNumber?: string
  source?: 'application' | 'device' | 'recognition'
  commandType?: string
  result?: string
  startTime?: string
  endTime?: string
}

export interface PaginatedOperationLogs {
  items: OperationLogItem[]
  total: number
  page: number
  pageSize: number
}

export interface OperationLogOptions {
  deviceNumbers: string[]
  commandTypes: string[]
  results: string[]
}
