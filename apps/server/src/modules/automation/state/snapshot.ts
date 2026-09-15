/**
 * 阅读导航：自动控制快照组装：把模式、期望/实际状态、安全与水量事实整理成页面能显示的结构；不改变状态机。
 * 入口位置：modules/automation/state/snapshot.ts
 */

import type {
  AutomationSnapshot,
  SafetySnapshot,
  WaterFlowSnapshot,
} from '@new26interthing/shared'

import type { AutomationConfig } from '../types.js'

interface SnapshotFacts {
  deviceNumber: string
  enabled: boolean
  state: AutomationSnapshot['state']
  desiredPump: AutomationSnapshot['desiredPump']
  desiredHeater: AutomationSnapshot['desiredHeater']
  actualPump: AutomationSnapshot['actualPump']
  actualHeater: AutomationSnapshot['actualHeater']
  enteredAt: number
  config: AutomationConfig | null
  outletTemperature: number | null
  pid: AutomationSnapshot['pid']
  limitationReason: string | null
  lastAction: AutomationSnapshot['lastAction']
  safety: SafetySnapshot
}

export const buildAutomationSnapshot = async (
  facts: SnapshotFacts,
  clock: () => number,
  getWaterFlow: () => Promise<WaterFlowSnapshot>,
): Promise<AutomationSnapshot> => ({
  deviceNumber: facts.deviceNumber,
  enabled: facts.enabled,
  state: facts.state,
  desiredPump: facts.desiredPump,
  desiredHeater: facts.desiredHeater,
  actualPump: facts.actualPump,
  actualHeater: facts.actualHeater,
  countdownSeconds: facts.state === 'building-flow' && facts.config
    ? Math.max(0, Math.ceil(
        facts.config.buildFlowTimeoutSeconds - (clock() - facts.enteredAt) / 1_000,
      ))
    : facts.state === 'cooling' && facts.config
      ? Math.max(0, Math.ceil(
          facts.config.coolingDelaySeconds - (clock() - facts.enteredAt) / 1_000,
        ))
      : null,
  temperatureStrategy: facts.config?.strategy ?? null,
  targetTemperature: facts.config?.targetTemperature ?? null,
  outletTemperature: facts.outletTemperature,
  pid: facts.pid,
  limitationReason: facts.limitationReason,
  lastAction: facts.lastAction,
  safety: facts.safety,
  waterFlow: await getWaterFlow(),
})
