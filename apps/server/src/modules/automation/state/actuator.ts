/**
 * 阅读导航：执行器状态：记录期望泵/加热状态、最近动作与顺序；注入的 execute 才负责真正发布，期望值不能冒充设备实际反馈。
 * 入口位置：modules/automation/state/actuator.ts
 */

import type {
  ActuatorValue,
  AutomationSnapshot,
} from '@new26interthing/shared'

type ActuatorTopic = 'pump' | 'heater'

interface Dependencies {
  execute(topic: ActuatorTopic, value: ActuatorValue): Promise<void>
}

/** 统一记录期望状态和最近动作，真正的 MQTT 发布由注入的 execute 完成。 */
export const createAutomationActuator = ({ execute }: Dependencies) => {
  let desiredPump: ActuatorValue = 'off'
  let desiredHeater: ActuatorValue = 'off'
  let publishedPump: ActuatorValue = 'off'
  let publishedHeater: ActuatorValue = 'off'
  let lastAction: AutomationSnapshot['lastAction'] = null
  let actionTail = Promise.resolve()

  const run = async (
    topic: ActuatorTopic,
    value: ActuatorValue,
    force = false,
  ) => {
    if (topic === 'pump') {
      desiredPump = value
      if (!force && publishedPump === value) return
    }
    else {
      desiredHeater = value
      if (!force && publishedHeater === value) return
    }

    actionTail = actionTail.then(() => execute(topic, value))
    try {
      await actionTail
      if (topic === 'pump') publishedPump = value
      else publishedHeater = value
      lastAction = {
        topic,
        value,
        status: 'published',
        message: 'MQTT 已发布',
      }
    }
    catch (error) {
      actionTail = Promise.resolve()
      const message = error instanceof Error ? error.message : String(error)
      const errorCode = error && typeof error === 'object' && 'code' in error
        ? error.code
        : undefined
      lastAction = {
        topic,
        value,
        status: errorCode === 'HEATER_SAFETY_BLOCKED' ? 'blocked' : 'failed',
        message,
      }
      throw error
    }
  }

  return {
    get desiredHeater() {
      return desiredHeater
    },
    get desiredPump() {
      return desiredPump
    },
    get lastAction() {
      return lastAction
    },
    adoptDesired(topic: ActuatorTopic, value: ActuatorValue) {
      if (topic === 'pump') desiredPump = value
      else desiredHeater = value
    },
    adoptPublished(topic: ActuatorTopic, value: ActuatorValue) {
      if (topic === 'pump') {
        desiredPump = value
        publishedPump = value
      }
      else {
        desiredHeater = value
        publishedHeater = value
      }
    },
    run,
  }
}
