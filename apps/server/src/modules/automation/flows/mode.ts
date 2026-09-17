/**
 * 阅读导航：模式切换流程：master 改的是后端自动状态机，不是直接发 MQTT；自动启动先校验数据与安全，再启动水泵。
 * 入口位置：modules/automation/flows/mode.ts
 */

import type {
  AutomationSnapshot,
} from '@new26interthing/shared'

import type {
  SafetyDecision,
  SafetySnapshot,
} from '../../safety/types.js'
import type {
  AutomationConfig,
  AutomationReading,
} from '../types.js'
import { AutomationError } from '../types.js'

interface Dependencies {
  clock(): number
  runExclusive<T>(operation: () => Promise<T>): Promise<T>
  isEnabled(): boolean
  isDebugMode(): boolean
  loadConfig(): Promise<AutomationConfig>
  getLatestReading(): AutomationReading | null
  getSafetySnapshot(): SafetySnapshot
  evaluateReading(reading: AutomationReading): SafetyDecision | null
  applySafetyDecision(decision: SafetyDecision): Promise<boolean>
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

/**
 * 判断当前是否已有足够新鲜的设备读数允许启动自动模式。
 * @param reading 已经规范化的本次设备实时读数。
 * @param config 从后台配置读取并校验后的业务参数。
 * @param now 当前服务器时间戳，单位为毫秒。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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

/** 只处理自动模式启停；启动先校验数据和安全状态，再按顺序开启水泵。 */
export const createAutomationModeControl = (dependencies: Dependencies) => ({
  /**
   * 更新自动控制状态，并返回或广播更新后的结果。
   * @param nextEnabled 用户本次要求切换到的自动模式状态。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  setEnabled(nextEnabled: boolean) {
    return dependencies.runExclusive(async () => {
      if (dependencies.isEnabled() === nextEnabled) {
        return dependencies.getSnapshot()
      }

      const config = await dependencies.loadConfig()
      if (nextEnabled) {
        // 自动启动需要一包完整、足够新的设备实际读数；历史/补发读数不能满足条件。
        // 调试模式允许现场模拟跳过安全限制，但正常模式必须执行全部检查。
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
            const applied = await dependencies.applySafetyDecision(decision)
            if (applied) throw new AutomationError(decision.detail)
          }
        }
        dependencies.enterModeState(true, 'building-flow', '等待设备建流')
        // 开泵后先处于 building-flow；只有设备确认开泵且流量达到阈值，
        // engine.handleReading 才会转为 running，随后才可能开启加热。
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
        // 退出自动模式时先关加热。若泵仍期望开启，保留 cooling 状态，
        // tick 会在冷却延时后停泵，而不是这里立刻切断水循环。
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
