import type {
  ActuatorValue,
  AutomationState,
} from '@new26interthing/shared'

import type {
  SafetyAction,
  SafetyActionSource,
} from '../safety/safety.types.js'
import type { SafetySupervisor } from '../safety/safety-supervisor.js'
import type {
  AutomationConfig,
  AutomationReading,
} from './automation.types.js'

interface Dependencies {
  safety: SafetySupervisor
  getConfig(): AutomationConfig | null
  getState(): AutomationState
  getStateEnteredAt(): number
  getDesiredPump(): ActuatorValue
  getDesiredHeater(): ActuatorValue
  getManualPumpStartedAt(): number | null
}

export const createAutomationSafetyBridge = ({
  safety,
  getConfig,
  getState,
  getStateEnteredAt,
  getDesiredPump,
  getDesiredHeater,
  getManualPumpStartedAt,
}: Dependencies) => {
  const context = () => {
    const config = getConfig()
    if (!config) throw new Error('控制配置尚未加载')
    return {
      state: getState(),
      stateEnteredAt: getStateEnteredAt(),
      manualPumpStartedAt: getManualPumpStartedAt(),
      desiredPump: getDesiredPump(),
      desiredHeater: getDesiredHeater(),
      config: {
        minSafeFlow: config.minSafeFlow,
        maxSafePressure: config.maxSafePressure,
        maxSafeTemperature: config.maxSafeTemperature,
        dataTimeoutSeconds: config.dataTimeoutSeconds,
        lowFlowConfirmSeconds: config.lowFlowConfirmSeconds,
        buildFlowTimeoutSeconds: config.buildFlowTimeoutSeconds,
        temperatureReversedConfirmSeconds: config.temperatureReversedConfirmSeconds,
        dryHeatingTimeoutSeconds: config.dryHeatingTimeoutSeconds,
        dryHeatingTemperatureDifference: config.dryHeatingTemperatureDifference,
      },
    }
  }

  return {
    context,
    evaluateReading(reading: AutomationReading) {
      return safety.handleReading({
        recordedAt: reading.recordedAt,
        flowRate: reading.flowRate,
        pressure: reading.pressure === undefined ? 0 : reading.pressure,
        inletTemperature: reading.inletTemperature === undefined
          ? reading.outletTemperature
          : reading.inletTemperature,
        outletTemperature: reading.outletTemperature,
        actualPump: reading.actualPump,
        actualHeater: reading.actualHeater,
      }, context())
    },
    tick() {
      return safety.tick(context())
    },
    authorize(action: SafetyAction, source: SafetyActionSource = 'automation') {
      return safety.authorize(action, context(), source)
    },
    canReset() {
      return safety.canReset(context())
    },
  }
}
