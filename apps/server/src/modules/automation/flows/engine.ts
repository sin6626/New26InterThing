/**
 * 阅读导航：单设备状态机：串行处理页面操作、设备数据与定时 tick；这里拥有模式和运行状态，但安全判断委托 safety，设备发布委托执行器。
 * 入口位置：modules/automation/flows/engine.ts
 */

import type {
  ActuatorValue,
  AutomationSnapshot,
  AutomationStatusMessage,
  WaterFlowSnapshot,
} from '@new26interthing/shared'

import { createAutomationActuator } from '../state/actuator.js'
import { createAutomationSafetyBridge } from './safety-bridge.js'
import { createAutomationManualControl } from './manual.js'
import { createAutomationModeControl } from './mode.js'
import { createAutomationProtection } from './protection.js'
import { createAutomationTemperatureDemand } from './demand.js'
import { buildAutomationSnapshot } from '../state/snapshot.js'
import { createSafetySupervisor } from '../../safety/state/supervisor.js'
import type {
  SafetyAction,
  SafetyDecision,
  SafetyFaultCode,
} from '../../safety/types.js'
import type {
  AutomationConfig,
  AutomationReading,
} from '../types.js'
import { AutomationError } from '../types.js'

export type {
  AutomationConfig,
  AutomationReading,
} from '../types.js'

interface Dependencies {
  deviceNumber: string
  initialDebugMode?: boolean
  clock?: () => number
  loadConfig(): Promise<AutomationConfig>
  execute(topic: 'pump' | 'heater', value: ActuatorValue): Promise<void>
  getWaterFlow(): Promise<WaterFlowSnapshot>
  emit(message: AutomationStatusMessage): void
  disableMaster?(reason: string): Promise<void>
  reportFault?(errorNumber: SafetyFaultCode, detail: string): Promise<void>
}

export const createAutomationEngine = ({
  deviceNumber,
  initialDebugMode = false,
  clock = Date.now,
  loadConfig,
  execute,
  getWaterFlow,
  emit,
  disableMaster = async () => {},
  reportFault = async () => {},
}: Dependencies) => {
  /**
   * 单台设备的自动水循环状态机。
   * 状态只在这里变化；执行器负责 MQTT，安全监督器负责判断，保护器负责落实停机。
   */
  const actuator = createAutomationActuator({ execute })
  const safety = createSafetySupervisor(clock)
  // enabled 表示“自动模式是否被请求”；state 表示“当前走到哪一步”。
  // 例如停止自动模式后，enabled=false 但 state 仍可能是 cooling，需要继续让泵散热。
  let enabled = false
  let state: AutomationSnapshot['state'] = 'stopped'
  let actualPump: AutomationSnapshot['actualPump'] = 'unknown'
  let actualHeater: AutomationSnapshot['actualHeater'] = 'unknown'
  // actual* 来自设备上行反馈；actuator.desired* 是后端希望设备达到的状态。
  // 两者可能不同，尤其在 MQTT 刚发布、设备尚未执行或反馈丢失时。
  let enteredAt = clock()
  let config: AutomationConfig | null = null
  let outletTemperature: number | null = null
  let limitationReason: string | null = null
  let configFingerprint = ''
  let latestReading: AutomationReading | null = null
  let operationTail = Promise.resolve()
  let manualPumpStartedAt: number | null = null
  let readingGeneration = 0
  let debugMode = initialDebugMode

  const safetyBridge = createAutomationSafetyBridge({
    safety,
    getConfig: () => config,
    getState: () => state,
    getStateEnteredAt: () => enteredAt,
    getDesiredPump: () => actuator.desiredPump,
    getDesiredHeater: () => actuator.desiredHeater,
    getManualPumpStartedAt: () => manualPumpStartedAt,
  })
  const temperatureDemand = createAutomationTemperatureDemand({
    clock,
    getDesiredHeater: () => actuator.desiredHeater,
    authorize: value => debugMode
      ? { allowed: true, reason: null }
      : safetyBridge.authorize({ topic: 'heater', value }),
    run: value => actuator.run('heater', value),
    setLimitation: reason => {
      limitationReason = reason
    },
    onFailure: error => handleDemandFailure(error),
  })
  const protection = createAutomationProtection({
    clock,
    actuator,
    getState: () => state,
    getActualPump: () => actualPump,
    getActualHeater: () => actualHeater,
    getCoolingDelaySeconds: () => config?.coolingDelaySeconds ?? 0,
    enterFault(detail) {
      enabled = false
      state = 'fault'
      enteredAt = clock()
      limitationReason = detail
    },
    resetTemperatureControl() {
      temperatureDemand.reset()
    },
    refreshSafetyContext: () => {
      if (config) safetyBridge.tick()
    },
    setLimitation: reason => {
      limitationReason = reason
    },
    disableMaster,
    reportFault,
  })

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    // MQTT、定时 tick 和页面操作可能同时到达，串行队列防止状态交叉覆盖。
    const current = operationTail.then(operation, operation)
    operationTail = current.then(
      () => undefined,
      () => undefined,
    )
    return current
  }

  const getSnapshot = () => buildAutomationSnapshot({
    // 快照是给页面看的只读事实，不触发模式转换或设备操作。
    deviceNumber,
    enabled,
    state,
    desiredPump: actuator.desiredPump,
    desiredHeater: actuator.desiredHeater,
    actualPump,
    actualHeater,
    enteredAt,
    config,
    outletTemperature,
    pid: temperatureDemand.pid,
    limitationReason,
    lastAction: actuator.lastAction,
    safety: {
      ...safety.getSnapshot(),
      ...protection.reportingSnapshot(),
    },
  }, clock, getWaterFlow)

  const notify = async () => {
    emit({
      type: 'automation.status',
      data: await getSnapshot(),
    })
  }

  const handleDemandFailure = async (error: unknown) => {
    // 指令发送失败会进入可锁定故障；“安全门拒绝开启”已经记录为 blocked，
    // 不应再次伪装为 MQTT 发布失败。
    const message = error instanceof Error ? error.message : String(error)
    if (actuator.lastAction?.status === 'blocked') return
    await applySafetyDecision(safety.trip(
      'COMMAND_PUBLISH_FAILED',
      `控制指令发布失败：${message}`,
    ))
  }

  const applySafetyDecision = async (decision: SafetyDecision) => {
    await protection.apply(decision)
  }

  const loadCheckedConfig = async () => {
    // 配置非法时不能继续自动运行，因此将其提升为可锁定的安全故障。
    try {
      const loaded = await loadConfig()
      config = loaded
      configFingerprint = JSON.stringify(loaded)
      return loaded
    }
    catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      await applySafetyDecision(safety.trip(
        'CONTROL_CONFIG_INVALID',
        `控制配置无效：${detail}`,
      ))
      throw new AutomationError(`控制配置无效：${detail}`)
    }
  }

  const updateTemperatureDemand = () => temperatureDemand.update(
    state,
    config,
    outletTemperature,
  )

  const manualControl = createAutomationManualControl({
    clock,
    runExclusive: serialize,
    ensureConfig: async () => {
      if (!config) await loadCheckedConfig()
    },
    evaluateLatestSafety: async () => {
      if (!latestReading || debugMode) return
      const decision = safetyBridge.evaluateReading(latestReading)
      if (decision) await applySafetyDecision(decision)
    },
    authorize: action => debugMode
      ? { allowed: true, reason: null }
      : safetyBridge.authorize(action, 'manual'),
    failCommand: async (action, message) => {
      await applySafetyDecision(safety.trip(
        'COMMAND_PUBLISH_FAILED',
        `${action.topic}=${action.value} 指令发布失败：${message}`,
      ))
    },
    adoptPublished: (topic, value) => actuator.adoptPublished(topic, value),
    setManualPumpStartedAt: value => {
      manualPumpStartedAt = value
    },
    notify,
  })
  const modeControl = createAutomationModeControl({
    clock,
    runExclusive: serialize,
    isEnabled: () => enabled,
    isDebugMode: () => debugMode,
    loadConfig: loadCheckedConfig,
    getLatestReading: () => latestReading,
    getSafetySnapshot: () => safety.getSnapshot(),
    evaluateReading: reading => safetyBridge.evaluateReading(reading),
    applySafetyDecision,
    desiredPump: () => actuator.desiredPump,
    runPump: value => actuator.run('pump', value),
    runHeater: value => actuator.run('heater', value),
    handleDemandFailure,
    enterModeState(nextEnabled, nextState, reason) {
      enabled = nextEnabled
      state = nextState
      enteredAt = clock()
      limitationReason = reason
    },
    notify,
    getSnapshot,
  })

  return {
    setDebugMode(nextDebugMode: boolean) {
      return serialize(async () => {
        debugMode = nextDebugMode
        if (debugMode && safety.getSnapshot().locked) {
          safety.reset()
          protection.reset()
          state = 'stopped'
          enabled = false
          limitationReason = null
          enteredAt = clock()
        }
        await notify()
      })
    },
    setEnabled(nextEnabled: boolean) {
      return modeControl.setEnabled(nextEnabled)
    },

    handleReading(reading: AutomationReading) {
      // 先更新实际反馈，再判断安全，最后计算新的温控需求。
      readingGeneration += 1
      // readingGeneration 用于复位期间检查设备数据是否变化；复位前后的安全事实
      // 必须一致，不能在发关机命令的间隙忽略新来的异常读数。
      return serialize(async () => {
        latestReading = reading
        actualPump = reading.actualPump
        actualHeater = reading.actualHeater
        if (reading.outletTemperature !== null) {
          outletTemperature = reading.outletTemperature
        }
        if (!config) {
          try {
            await loadCheckedConfig()
          }
          catch {
            await notify()
            return
          }
        }
        const decision = debugMode ? null : safetyBridge.evaluateReading(reading)
        if (decision) {
          await applySafetyDecision(decision)
          await notify()
          return
        }
        if (
          state === 'building-flow'
          && config
          && actualPump === 'on'
          && reading.flowRate !== null
          && reading.flowRate >= config.minSafeFlow
        ) {
          // 不能只凭“已发开泵指令”就宣布运行：必须看到设备实际开泵且流量已建立。
          state = 'running'
          enteredAt = clock()
          limitationReason = null
        }
        await updateTemperatureDemand()
        await notify()
      })
    },

    tick() {
      // 处理由时间经过触发的规则：数据超时、冷却延时和 PID 时间窗口。
      return serialize(async () => {
        if (!config) {
          try {
            await loadCheckedConfig()
          }
          catch {
            await notify()
            return
          }
        }
        if (!config) return
        const safetyDecision = debugMode ? null : safetyBridge.tick()
        if (safetyDecision) {
          await applySafetyDecision(safetyDecision)
        }
        if (state === 'fault') {
          try {
            await protection.stopPumpAfterCooling()
          }
          catch (error) {
            await handleDemandFailure(error)
          }
        }
        let latestConfig: AutomationConfig
        try {
          latestConfig = await loadConfig()
        }
        catch (error) {
          const detail = error instanceof Error ? error.message : String(error)
          await applySafetyDecision(safety.trip(
            'CONTROL_CONFIG_INVALID',
            `控制配置无效：${detail}`,
          ))
          await notify()
          return
        }
        const latestFingerprint = JSON.stringify(latestConfig)
        if (latestFingerprint !== configFingerprint) {
          // 后台参数可在运行期间改变；PID 积分依赖旧参数，配置变化时清除旧积分。
          config = latestConfig
          configFingerprint = latestFingerprint
          temperatureDemand.reset()
        }
        const elapsed = (clock() - enteredAt) / 1_000
        if (state === 'cooling' && elapsed >= config.coolingDelaySeconds) {
          // 先关加热再保留水泵循环，冷却时间结束才真正停泵。
          try {
            await actuator.run('pump', 'off')
            state = 'stopped'
            limitationReason = null
          }
          catch (error) {
            await handleDemandFailure(error)
          }
        }
        await updateTemperatureDemand()
        await notify()
      })
    },

    getSnapshot,

    authorizeAction(action: SafetyAction) {
      return serialize(async () => {
        if (!config) await loadCheckedConfig()
        if (latestReading) {
          const decision = debugMode ? null : safetyBridge.evaluateReading(latestReading)
          if (decision) await applySafetyDecision(decision)
        }
        return debugMode
          ? { allowed: true, reason: null }
          : safetyBridge.authorize(action, 'manual')
      })
    },

    executeManualAction(
      action: SafetyAction,
      publish: () => Promise<void>,
    ) {
      return manualControl.execute(action, publish)
    },

    recordCommand(action: SafetyAction) {
      manualControl.adopt(action)
    },

    handleCommandFailure(action: SafetyAction, message: string) {
      return serialize(async () => {
        const decision = safety.trip(
          'COMMAND_PUBLISH_FAILED',
          `${action.topic}=${action.value} 指令发布失败：${message}`,
        )
        await applySafetyDecision(decision)
        await notify()
      })
    },

    tripFault(faultCode: SafetyFaultCode, detail: string) {
      return serialize(async () => {
        await applySafetyDecision(safety.trip(faultCode, detail))
        await notify()
      })
    },

    resetFault() {
      return serialize(async () => {
        // 复位是“先确认→发送关闭→再次确认→清锁”，不是点击按钮就直接清故障。
        // 这样可防止设备尚在运行或复位过程中收到新读数时错误恢复自动模式。
        config = await loadCheckedConfig()
        const resetGeneration = readingGeneration
        const authorization = safetyBridge.canReset()
        if (!authorization.allowed) {
          throw new AutomationError(authorization.reason || '当前不能复位')
        }
        await actuator.run('heater', 'off', true)
        await actuator.run('pump', 'off', true)
        if (readingGeneration !== resetGeneration) {
          throw new AutomationError('复位期间收到新的设备数据，请重新确认安全状态')
        }
        const finalAuthorization = safetyBridge.canReset()
        if (!finalAuthorization.allowed) {
          throw new AutomationError(finalAuthorization.reason || '复位条件已变化')
        }
        safety.reset()
        state = 'stopped'
        enabled = false
        enteredAt = clock()
        limitationReason = null
        protection.reset()
        manualPumpStartedAt = null
        await notify()
        return getSnapshot()
      })
    },

    close() {
      return serialize(async () => {
        enabled = false
        let closeError: unknown
        try {
          await actuator.run('heater', 'off', true)
        }
        catch (error) {
          closeError = error
        }
        try {
          await actuator.run('pump', 'off', true)
        }
        catch (error) {
          closeError ??= error
        }
        state = 'stopped'
        if (closeError) throw closeError
      })
    },
  }
}

export type AutomationEngine = ReturnType<typeof createAutomationEngine>
