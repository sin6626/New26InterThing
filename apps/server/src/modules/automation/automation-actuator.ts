import type {
  ActuatorValue,
  AutomationSnapshot,
} from '@new26interthing/shared'

type ActuatorTopic = 'pump' | 'heater'

interface Dependencies {
  execute(topic: ActuatorTopic, value: ActuatorValue): Promise<void>
}

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
  ) => {
    if (topic === 'pump') {
      desiredPump = value
      if (publishedPump === value) return
    }
    else {
      desiredHeater = value
      if (publishedHeater === value) return
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
    run,
  }
}
