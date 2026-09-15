import type { AutomationStatusMessage } from '@new26interthing/shared'
import type {
  SafetyAction,
  SafetyFaultCode,
} from '../../safety/types.js'

import {
  createAutomationEngine,
  type AutomationEngine,
} from './engine.js'
import type {
  AutomationConfig,
  AutomationReading,
} from '../types.js'
import type { WaterFlowService } from '../../water-flow/accumulate.js'

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

/** 按设备编号延迟创建并缓存状态机，对 HTTP、MQTT 和定时器提供统一入口。 */
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
  let debugMode = false
  let activeDeviceNumber: string | undefined

  const getEngine = (deviceNumber: string) => {
    if (engine && activeDeviceNumber !== deviceNumber) {
      throw new Error('系统只允许维护一台自动控制设备')
    }
    if (engine) return engine
    activeDeviceNumber = deviceNumber
    engine = createAutomationEngine({
      deviceNumber,
      initialDebugMode: debugMode,
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
    async setEnabled(deviceNumber: string, enabled: boolean) {
      const currentEngine = getEngine(deviceNumber)
      if (debugMode) await currentEngine.setDebugMode(true)
      return currentEngine.setEnabled(enabled)
    },
    getDebugMode() {
      return { enabled: debugMode }
    },
    async setDebugMode(enabled: boolean) {
      debugMode = enabled
      await engine?.setDebugMode(enabled)
      return { enabled: debugMode }
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
