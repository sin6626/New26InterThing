import type { AutomationStatusMessage } from '@new26interthing/shared'
import type {
  SafetyAction,
  SafetyFaultCode,
} from '../safety/safety.types.js'

import {
  createAutomationEngine,
  type AutomationEngine,
} from './automation-engine.js'
import type {
  AutomationConfig,
  AutomationReading,
} from './automation.types.js'
import type { WaterFlowService } from '../water-flow/water-flow.service.js'

interface Dependencies {
  clock?: () => number
  loadConfig(): Promise<AutomationConfig>
  execute(
    deviceNumber: string,
    topic: 'pump' | 'heater',
    value: 'on' | 'off',
  ): Promise<void>
  waterFlow: WaterFlowService
  emit(message: AutomationStatusMessage): void
  disableMaster(deviceNumber: string, reason: string): Promise<void>
  reportFault(
    deviceNumber: string,
    errorNumber: SafetyFaultCode,
    detail: string,
  ): Promise<void>
}

export const createAutomationManager = ({
  clock,
  loadConfig,
  execute,
  waterFlow,
  emit,
  disableMaster,
  reportFault,
}: Dependencies) => {
  let engine: AutomationEngine | undefined
  let activeDeviceNumber: string | undefined

  const getEngine = (deviceNumber: string) => {
    if (engine && activeDeviceNumber !== deviceNumber) {
      throw new Error('系统只允许维护一台自动控制设备')
    }
    if (engine) return engine
    activeDeviceNumber = deviceNumber
    engine = createAutomationEngine({
      deviceNumber,
      clock,
      loadConfig,
      execute: (topic, value) => execute(deviceNumber, topic, value),
      getWaterFlow: () => waterFlow.getSnapshot(deviceNumber),
      emit,
      disableMaster: reason => disableMaster(deviceNumber, reason),
      reportFault: (errorNumber, detail) => reportFault(
        deviceNumber,
        errorNumber,
        detail,
      ),
    })
    return engine
  }

  return {
    setEnabled(deviceNumber: string, enabled: boolean) {
      return getEngine(deviceNumber).setEnabled(enabled)
    },
    getSnapshot(deviceNumber: string) {
      return getEngine(deviceNumber).getSnapshot()
    },
    handleReading(deviceNumber: string, reading: AutomationReading) {
      return getEngine(deviceNumber).handleReading(reading)
    },
    authorizeAction(deviceNumber: string, action: SafetyAction) {
      return getEngine(deviceNumber).authorizeAction(action)
    },
    executeAction(
      deviceNumber: string,
      action: SafetyAction,
      publish: () => Promise<void>,
    ) {
      return getEngine(deviceNumber).executeManualAction(action, publish)
    },
    recordCommand(deviceNumber: string, action: SafetyAction) {
      getEngine(deviceNumber).recordCommand(action)
    },
    recordCommandFailure(
      deviceNumber: string,
      action: SafetyAction,
      message: string,
    ) {
      return getEngine(deviceNumber).handleCommandFailure(action, message)
    },
    tripFault(
      deviceNumber: string,
      faultCode: SafetyFaultCode,
      detail: string,
    ) {
      return getEngine(deviceNumber).tripFault(faultCode, detail)
    },
    resetFault(deviceNumber: string) {
      return getEngine(deviceNumber).resetFault()
    },
    async tick() {
      await engine?.tick()
    },
    async close() {
      await engine?.close()
    },
  }
}

export type AutomationManager = ReturnType<typeof createAutomationManager>
