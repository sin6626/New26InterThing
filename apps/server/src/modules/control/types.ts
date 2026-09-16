/**
 * 阅读导航：控制定义与仓储接口：一条控制项包含控件类型、配置值及可选设备指令模板；旧值用于操作日志。
 * 入口位置：modules/control/types.ts
 */

import type { ControlSnapshot } from '@new26interthing/shared'

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
  getDefinitionByTopic?(topic: string): Promise<ControlDefinition | null>
  saveSuccess(definition: ControlDefinition, deviceNumber: string, value: string, remark: string, triggerMode?: 'manual' | 'automatic'): Promise<void>
  saveFailure(definition: ControlDefinition, deviceNumber: string, value: string, remark: string, triggerMode?: 'manual' | 'automatic'): Promise<void>
  applyDeviceReport(deviceNumber: string, configId: number, value: string): Promise<void>
  saveTimeSync(deviceNumber: string, value: string, result: string, remark: string): Promise<void>
}
