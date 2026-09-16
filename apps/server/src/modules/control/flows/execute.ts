/**
 * 阅读导航：指令执行主流程：规范化控件值→验证→安全门→按模板发布→写控制值与日志；master 和参数通常只存库，泵/加热才发布。
 * 入口位置：modules/control/flows/execute.ts
 */

import type {
  ControlCommandIntent,
  ControlCommandResult,
} from '@new26interthing/shared'

import { buildCommandEnvelope } from '../adapters/command.js'
import { isDeviceCommand } from '../rules/policy.js'
import type { ControlRepository } from '../types.js'

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

/**
 * 按照控制项类型规范化页面提交值，拒绝不符合后台配置的数据。
 * @param value 本次准备读取、转换或保存的值。
 * @param fieldType 后台控制配置使用的控件类型编码。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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

/**
 * 提取控制项允许值，供提交前执行白名单校验。
 * @param options 调用方传入的依赖或业务选项，具体字段见参数的 TypeScript 类型。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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

/**
 * 控制业务门面：校验动态配置、区分运行指令与参数保存，并统一记录操作日志。
 * pump/heater 会发布 MQTT；master 交给自动状态机；普通参数只写数据库。
 */
export const createControlService = (
  repository: ControlRepository,
  publisher: CommandPublisher,
  automation?: AutomationModeController,
) => {
  /**
   * 执行一次指令控制业务操作，按照模块规则更新状态和外部副作用。
   * @param intent 已经校验、准备执行的控制意图。
   * @param trustedAutomation 该动作是否来自后端自动状态机，而不是页面人工请求。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const executeCommand = async (
    intent: ControlCommandIntent,
    trustedAutomation = false,
  ): Promise<ControlCommandResult> => {
    // 前端只给设备编号、配置 ID 和新值；真正的控件类型、取值范围和 MQTT 模板
    // 必须从后台配置读取，不能直接相信页面传来的“这是一条泵指令”。
    const definition = await repository.getDefinition(intent.deviceNumber, intent.configId)
    if (!definition) throw new ControlError('未找到对应的指令配置', 404)

    const value = normalizeValue(intent.value, definition.fieldType)
    if (!value) throw new ControlError('指令值不能为空', 400)

    if (!['1', '2', '3', '4', '5', '6'].includes(definition.fieldType)) {
      throw new ControlError('暂不支持该控件类型', 400)
    }

    const hasNumericRange = definition.min !== null || definition.max !== null
    // 数据库的 min/max 是字符串：先转为数字验证，防止非法参数保存后使状态机无法启动。
    if (definition.fieldType === '3' || hasNumericRange) {
      const number = Number(value)
      if (!Number.isFinite(number)) throw new ControlError('配置值必须是有效数字', 400)
      if (definition.min !== null && number < Number(definition.min)) throw new ControlError(`配置值不能小于 ${definition.min}`, 400)
      if (definition.max !== null && number > Number(definition.max)) throw new ControlError(`配置值不能大于 ${definition.max}`, 400)
    }

    if (definition.fieldType === '4' && !/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(value)) {
      throw new ControlError('时间值必须使用 YYYY-MM-DD HH:mm:ss 格式', 400)
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
    // master 切换的是后端自动模式；PID、阈值等参数只保存；只有运行执行器发布 MQTT。
    // 因而 shouldPublish 与“配置里填了 publish_topic”并不等价。
    const action = shouldPublish
      ? {
          topic: definition.topic as 'pump' | 'heater',
          value: value as 'on' | 'off',
        }
      : null
    if (!trustedAutomation && action) {
      // 人工开启不能绕过自动控制模块维护的安全状态。trustedAutomation 只表示
      // 这次动作已经来自后端状态机，并非允许页面声明自己是“可信自动动作”。
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
        await Promise.resolve(repository.saveFailure(
          definition,
          intent.deviceNumber,
          value,
          '自动模式切换失败',
          trustedAutomation ? 'automatic' : 'manual',
        )).catch(() => undefined)
        if (error instanceof ControlError) throw error
        throw new ControlError(error instanceof Error ? error.message : String(error), 409)
      }
    }

    if (shouldPublish) {
      // value_map 把 on/off 翻译为设备编码；payload_template 再组成真正的 MQTT JSON。
      // 编码和 topic 来自数据库，所以换设备协议时不应改这里的业务判断。
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
        /**
         * 向外部通道发布指令控制指令，发布失败会交给调用方处理。
         * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
         */
        const publish = () => publisher.publish(envelope.topic, envelope.payload)
        if (!trustedAutomation && action) {
          await automation!.executeAction!(intent.deviceNumber, action, publish)
        }
        else await publish()
      }
      catch (error) {
        // MQTT 或安全授权失败时仍写失败日志。日志保存自身失败不应吞掉原始发布错误。
        const message = error instanceof Error ? error.message : String(error)
        await Promise.resolve(repository.saveFailure(
          definition,
          intent.deviceNumber,
          value,
          `应用层下发失败：${message}`,
          trustedAutomation ? 'automatic' : 'manual',
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
      // 先发布设备命令，再保存控制值。若第二步失败，设备“可能已收到指令”，
      // 所以下面的错误信息明确提示不能把数据库值当作设备执行结果。
      await repository.saveSuccess(
        definition,
        intent.deviceNumber,
        value,
        shouldPublish ? '应用层下发；MQTT发布成功' : '应用层配置保存（无需MQTT下发）',
        trustedAutomation ? 'automatic' : 'manual',
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
    /**
     * 生成时间同步载荷并通过统一指令流程发布，同时记录操作结果。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param requestedTime 页面要求同步到设备的目标时间。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async syncTime(deviceNumber: string, requestedTime?: string) {
      // 时间同步是固定协议的特殊指令，不从普通控制配置树选择 pump/heater 模板。
      const date = requestedTime ? new Date(requestedTime.replace(' ', 'T')) : new Date()
      if (Number.isNaN(date.getTime())) throw new ControlError('时间格式错误', 400)
      /**
       * 把单个时间数字补齐为两位字符串，供日期时间格式化复用。
       * @param value 本次准备读取、转换或保存的值。
       * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
       */
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
