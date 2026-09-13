import type {
  ControlCommandIntent,
  ControlCommandResult,
} from '@new26interthing/shared'

import { buildCommandEnvelope } from './command.adapter.js'
import { isDeviceCommand } from './control-policy.js'
import type { ControlRepository } from './control.repository.js'

export interface CommandPublisher {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>
}

type DeviceControlAction = {
  topic: 'pump' | 'heater'
  value: 'on' | 'off'
}

export interface AutomationModeController {
  setEnabled(deviceNumber: string, enabled: boolean): Promise<unknown>
  executeAction?(
    deviceNumber: string,
    action: DeviceControlAction,
    publish: () => Promise<void>,
  ): Promise<void>
}

export class ControlError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message)
  }
}

const normalizeValue = (
  value: ControlCommandIntent['value'],
  fieldType: string,
) => {
  if (fieldType === '1') {
    if (value === true || value === 'on') return 'on'
    if (value === false || value === 'off') return 'off'
    throw new ControlError('开关值必须是 on 或 off', 400)
  }
  if (Array.isArray(value)) return value.join(',')
  return String(value).trim()
}

const optionValues = (options: unknown) => {
  if (!Array.isArray(options)) return []
  return options.flatMap((option) => {
    if (typeof option === 'string' || typeof option === 'number') {
      return [String(option)]
    }
    if (option && typeof option === 'object' && 'value' in option) {
      return [String(option.value)]
    }
    return []
  })
}

export const createControlService = (
  repository: ControlRepository,
  publisher: CommandPublisher,
  automation?: AutomationModeController,
) => {
  const executeCommand = async (
    intent: ControlCommandIntent,
    trustedAutomation = false,
  ): Promise<ControlCommandResult> => {
    const definition = await repository.getDefinition(intent.deviceNumber, intent.configId)
    if (!definition) throw new ControlError('未找到对应的指令配置', 404)

    const value = normalizeValue(intent.value, definition.fieldType)
    if (!value) throw new ControlError('指令值不能为空', 400)

    if (!['1', '2', '3', '4', '5', '6'].includes(definition.fieldType)) {
      throw new ControlError('暂不支持该控件类型', 400)
    }

    const hasNumericRange = definition.min !== null || definition.max !== null
    if (definition.fieldType === '3' || hasNumericRange) {
      const number = Number(value)
      if (!Number.isFinite(number)) throw new ControlError('配置值必须是有效数字', 400)
      if (definition.min !== null && number < Number(definition.min)) throw new ControlError(`配置值不能小于 ${definition.min}`, 400)
      if (definition.max !== null && number > Number(definition.max)) throw new ControlError(`配置值不能大于 ${definition.max}`, 400)
    }

    if (definition.fieldType === '4' && !/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)) {
      throw new ControlError('时间值必须使用 HH:mm:ss 格式', 400)
    }

    if (['5', '6'].includes(definition.fieldType)) {
      const allowed = optionValues(definition.options)
      const selected = definition.fieldType === '6'
        ? value.split(',').filter(Boolean)
        : [value]
      if (selected.some(item => !allowed.includes(item))) {
        throw new ControlError('指令值不在配置选项中', 400)
      }
    }
    const shouldPublish = isDeviceCommand(definition.topic)
    const action = shouldPublish
      ? {
          topic: definition.topic as 'pump' | 'heater',
          value: value as 'on' | 'off',
        }
      : null
    if (!trustedAutomation && action) {
      if (!automation?.executeAction) {
        throw new ControlError('安全控制服务尚未初始化', 503)
      }
    }
    if (definition.topic === 'master') {
      if (!automation) throw new ControlError('自动控制服务尚未初始化', 503)
      try {
        await automation.setEnabled(intent.deviceNumber, value === 'on')
      }
      catch (error) {
        if (error instanceof ControlError) throw error
        throw new ControlError(error instanceof Error ? error.message : String(error), 409)
      }
    }

    if (shouldPublish) {
      const envelope = buildCommandEnvelope({
        deviceNumber: intent.deviceNumber,
        configId: intent.configId,
        topic: definition.topic,
        publishTopic: definition.publishTopic,
        payloadTemplate: definition.payloadTemplate,
        valueMap: definition.valueMap,
        value,
      })
      try {
        const publish = () => publisher.publish(envelope.topic, envelope.payload)
        if (!trustedAutomation && action) {
          await automation!.executeAction!(intent.deviceNumber, action, publish)
        }
        else await publish()
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await Promise.resolve(repository.saveFailure(
          definition,
          intent.deviceNumber,
          value,
          `应用层下发失败：${message}`,
        )).catch(() => undefined)
        const status = error
          && typeof error === 'object'
          && 'status' in error
          && typeof error.status === 'number'
          ? error.status
          : 503
        throw new ControlError(message, status)
      }
    }

    try {
      await repository.saveSuccess(
        definition,
        intent.deviceNumber,
        value,
        shouldPublish ? '应用层下发；MQTT发布成功' : '应用层配置保存（无需MQTT下发）',
      )
    }
    catch {
      throw new ControlError(shouldPublish ? '设备指令可能已发布，但状态和日志保存失败' : '配置保存失败', 500)
    }
    return {
      configId: intent.configId,
      value,
      status: shouldPublish ? 'published' : 'saved',
    }
  }

  return {
    async syncTime(deviceNumber: string, requestedTime?: string) {
      const date = requestedTime ? new Date(requestedTime.replace(' ', 'T')) : new Date()
      if (Number.isNaN(date.getTime())) throw new ControlError('时间格式错误', 400)
      const pad = (value: number) => String(value).padStart(2, '0')
      const value = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
      try {
        await publisher.publish('device/updateTime', {
          d_no: deviceNumber,
          nowTime: value.slice(11),
          nowdate: `${value.slice(2, 4)}.${value.slice(5, 7)}.${value.slice(8, 10)}`,
        })
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await repository.saveTimeSync(deviceNumber, value, 'failed', `应用层下发失败：${message}`)
        throw new ControlError(message, 503)
      }

      try {
        await repository.saveTimeSync(
          deviceNumber,
          value,
          'success',
          '应用层下发；MQTT发布成功',
        )
      }
      catch {
        throw new ControlError('时间已发布，但操作日志保存失败', 500)
      }

      return {
        value,
        status: 'published' as const,
      }
    },

    execute: (intent: ControlCommandIntent) => executeCommand(intent),
    executeAutomation: (intent: ControlCommandIntent) => executeCommand(intent, true),
  }
}

export type ControlService = ReturnType<typeof createControlService>
