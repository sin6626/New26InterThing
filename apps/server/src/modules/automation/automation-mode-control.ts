import type {
  AutomationSnapshot,
} from '@new26interthing/shared'

import type {
  SafetyDecision,
  SafetySnapshot,
} from '../safety/safety.types.js'
import type {
  AutomationConfig,
  AutomationReading,
} from './automation.types.js'
import { AutomationError } from './automation.types.js'

interface Dependencies {
  clock(): number
  runExclusive<T>(operation: () => Promise<T>): Promise<T>
  isEnabled(): boolean
  isDebugMode(): boolean
  loadConfig(): Promise<AutomationConfig>
  getLatestReading(): AutomationReading | null
  getSafetySnapshot(): SafetySnapshot
  evaluateReading(reading: AutomationReading): SafetyDecision | null
  applySafetyDecision(decision: SafetyDecision): Promise<void>
  desiredPump(): 'on' | 'off'
  runPump(value: 'on'): Promise<void>
  runHeater(value: 'off'): Promise<void>
  handleDemandFailure(error: unknown): Promise<void>
  enterModeState(
    enabled: boolean,
    state: AutomationSnapshot['state'],
    limitationReason: string | null,
  ): void
  notify(): Promise<void>
  getSnapshot(): Promise<AutomationSnapshot>
}

const hasUsableReading = (
  reading: AutomationReading | null,
  config: AutomationConfig,
  now: number,
): reading is AutomationReading => reading !== null
  && reading.flowRate !== null
  && reading.pressure !== null
  && reading.inletTemperature !== null
  && reading.outletTemperature !== null
  && reading.actualPump !== 'unknown'
  && reading.actualHeater !== 'unknown'
  && now - reading.recordedAt >= 0
  && now - reading.recordedAt <= config.dataTimeoutSeconds * 1_000

export const createAutomationModeControl = (dependencies: Dependencies) => ({
  setEnabled(nextEnabled: boolean) {
    return dependencies.runExclusive(async () => {
      if (dependencies.isEnabled() === nextEnabled) {
        return dependencies.getSnapshot()
      }

      const config = await dependencies.loadConfig()
      if (nextEnabled) {
        const safety = dependencies.getSafetySnapshot()
        if (safety.locked && !dependencies.isDebugMode()) {
          throw new AutomationError(safety.detail || '故障已锁定，无法启动自动模式')
        }
        if (!dependencies.isDebugMode()) {
          const reading = dependencies.getLatestReading()
          if (!hasUsableReading(reading, config, dependencies.clock())) {
            throw new AutomationError('最近传感器数据不可用，无法启动自动模式')
          }
          const decision = dependencies.evaluateReading(reading)
          if (decision) {
            await dependencies.applySafetyDecision(decision)
            throw new AutomationError(decision.detail)
          }
        }
        dependencies.enterModeState(true, 'building-flow', '等待设备建流')
        try {
          await dependencies.runPump('on')
        }
        catch (error) {
          await dependencies.handleDemandFailure(error)
          await dependencies.notify()
          throw new AutomationError(error instanceof Error ? error.message : String(error))
        }
      }
      else {
        const state = dependencies.desiredPump() === 'on' ? 'cooling' : 'stopped'
        dependencies.enterModeState(
          false,
          state,
          state === 'cooling' ? '正在冷却' : null,
        )
        try {
          await dependencies.runHeater('off')
        }
        catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          await dependencies.handleDemandFailure(error)
          await dependencies.notify()
          throw new AutomationError(message)
        }
      }
      await dependencies.notify()
      return dependencies.getSnapshot()
    })
  },
})
