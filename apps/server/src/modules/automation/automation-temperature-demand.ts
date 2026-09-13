import type {
  ActuatorValue,
  AutomationState,
  PidSnapshot,
} from '@new26interthing/shared'

import type { SafetyAuthorization } from '../safety/safety.types.js'
import {
  createTemperatureController,
  hysteresisDemand,
} from './temperature-controller.js'
import type { AutomationConfig } from './automation.types.js'

interface Dependencies {
  clock(): number
  getDesiredHeater(): ActuatorValue
  authorize(value: ActuatorValue): SafetyAuthorization
  run(value: ActuatorValue): Promise<void>
  setLimitation(reason: string | null): void
  onFailure(error: unknown): Promise<void>
}

export const createAutomationTemperatureDemand = ({
  clock,
  getDesiredHeater,
  authorize,
  run,
  setLimitation,
  onFailure,
}: Dependencies) => {
  const controller = createTemperatureController(clock)
  let pid: PidSnapshot | null = null

  const publishAuthorized = async (value: ActuatorValue) => {
    const authorization = authorize(value)
    if (!authorization.allowed) {
      setLimitation(authorization.reason)
      try {
        await run('off')
      }
      catch (error) {
        await onFailure(error)
      }
      return
    }
    try {
      await run(value)
    }
    catch (error) {
      await onFailure(error)
    }
  }

  return {
    get pid() {
      return pid
    },
    reset() {
      controller.reset()
      pid = null
    },
    async update(
      state: AutomationState,
      config: AutomationConfig | null,
      outletTemperature: number | null,
    ) {
      if (!config) return
      if (state !== 'running') {
        if (getDesiredHeater() === 'on') await publishAuthorized('on')
        return
      }
      if (outletTemperature === null) return
      if (config.strategy === 'pid') {
        pid = controller.update(
          outletTemperature,
          config.pid,
          getDesiredHeater(),
        )
        setLimitation(pid.limitationReason)
        await publishAuthorized(pid.desired)
        return
      }
      const demand = hysteresisDemand(
        outletTemperature,
        config.targetTemperature,
        config.temperatureHysteresis,
        getDesiredHeater(),
      )
      await publishAuthorized(demand)
    },
  }
}
