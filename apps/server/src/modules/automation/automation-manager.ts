import type { AutomationStatusMessage } from '@new26interthing/shared'

import {
  createAutomationEngine,
  type AutomationEngine,
  type AutomationReading,
} from './automation-engine.js'
import type { AutomationConfig } from './automation-engine.js'
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
}

export const createAutomationManager = ({
  clock,
  loadConfig,
  execute,
  waterFlow,
  emit,
}: Dependencies) => {
  const engines = new Map<string, AutomationEngine>()

  const getEngine = (deviceNumber: string) => {
    const existing = engines.get(deviceNumber)
    if (existing) return existing
    const engine = createAutomationEngine({
      deviceNumber,
      clock,
      loadConfig,
      execute: (topic, value) => execute(deviceNumber, topic, value),
      getWaterFlow: () => waterFlow.getSnapshot(deviceNumber),
      emit,
    })
    engines.set(deviceNumber, engine)
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
    async tick() {
      await Promise.all([...engines.values()].map(engine => engine.tick()))
    },
    async close() {
      await Promise.all([...engines.values()].map(engine => engine.close()))
    },
  }
}

export type AutomationManager = ReturnType<typeof createAutomationManager>
