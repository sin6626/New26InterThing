/**
 * 阅读导航：人工操作流程：人工开关也走后端安全门；人工关闭优先于自动需求，人工开启必须满足安全授权。
 * 入口位置：modules/automation/flows/manual.ts
 */

import type { ActuatorValue } from '@new26interthing/shared'

import type {
  SafetyAction,
  SafetyAuthorization,
} from '../../safety/types.js'
import { AutomationError } from '../types.js'

interface Dependencies {
  clock(): number
  runExclusive<T>(operation: () => Promise<T>): Promise<T>
  ensureConfig(): Promise<void>
  evaluateLatestSafety(): Promise<void>
  authorize(action: SafetyAction): SafetyAuthorization
  failCommand(action: SafetyAction, message: string): Promise<void>
  adoptPublished(topic: 'pump' | 'heater', value: ActuatorValue): void
  setManualPumpStartedAt(value: number | null): void
  notify(): Promise<void>
}

/** 将人工开关同样接入后端安全门，避免手动模式绕过保护规则。 */
export const createAutomationManualControl = ({
  clock,
  runExclusive,
  ensureConfig,
  evaluateLatestSafety,
  authorize,
  failCommand,
  adoptPublished,
  setManualPumpStartedAt,
  notify,
}: Dependencies) => {
  let emergencyOffGeneration = 0
  const emergencyOffPublishers = new Map<'pump' | 'heater', () => Promise<void>>()

  /**
   * 人工指令成功后把结果同步进自动引擎，避免两套状态互相覆盖。
   * @param action 待安全授权或执行的设备控制动作。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const adopt = (action: SafetyAction) => {
    adoptPublished(action.topic, action.value)
    if (action.topic === 'pump') {
      setManualPumpStartedAt(action.value === 'on' ? clock() : null)
    }
  }

  /**
   * 执行一次自动控制业务操作，按照模块规则更新状态和外部副作用。
   * @param action 待安全授权或执行的设备控制动作。
   * @param publish 真正执行 MQTT 发布的底层函数。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const execute = (
    action: SafetyAction,
    publish: () => Promise<void>,
  ) => {
    if (action.value === 'off') {
      emergencyOffGeneration += 1
      emergencyOffPublishers.set(action.topic, publish)
      return publish()
        .then(() => adopt(action))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          void runExclusive(async () => {
            await failCommand(action, message)
            await notify()
          })
          throw new AutomationError(message, 503, 'COMMAND_PUBLISH_FAILED')
        })
    }

    return runExclusive(async () => {
      const startingEmergencyOffGeneration = emergencyOffGeneration
      await ensureConfig()
      await evaluateLatestSafety()
      const authorization = authorize(action)
      if (!authorization.allowed) {
        throw new AutomationError(authorization.reason || '安全条件不满足')
      }
      try {
        await publish()
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        await failCommand(action, message)
        await notify()
        throw new AutomationError(message, 503, 'COMMAND_PUBLISH_FAILED')
      }
      if (startingEmergencyOffGeneration !== emergencyOffGeneration) {
        const emergencyPublisher = emergencyOffPublishers.get(action.topic)
        if (emergencyPublisher) await emergencyPublisher()
        adopt({ ...action, value: 'off' })
      }
      else adopt(action)
      await notify()
    })
  }

  return {
    execute,
    adopt,
  }
}
