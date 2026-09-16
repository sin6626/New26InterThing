/**
 * 阅读导航：保护动作流程：把安全结论落实成关加热、冷却停泵和故障上报；规则只给结论，真正的设备动作在这里排序。
 * 入口位置：modules/automation/flows/protection.ts
 */

import type {
  ActuatorValue,
  AutomationState,
  SafetyFaultCode,
} from '@new26interthing/shared'

import type { SafetyDecision } from '../../safety/types.js'

interface ProtectionActuator {
  readonly desiredPump: ActuatorValue
  adoptDesired(topic: 'pump' | 'heater', value: ActuatorValue): void
  run(topic: 'pump' | 'heater', value: ActuatorValue, force?: boolean): Promise<void>
}

interface Dependencies {
  clock(): number
  actuator: ProtectionActuator
  getState(): AutomationState
  getActualPump(): ActuatorValue | 'unknown'
  getActualHeater(): ActuatorValue | 'unknown'
  getCoolingDelaySeconds(): number
  enterFault(detail: string): void
  resetTemperatureControl(): void
  refreshSafetyContext(): void
  setLimitation(reason: string): void
  disableMaster(reason: string): Promise<void> | void
  reportFault(errorNumber: SafetyFaultCode, detail: string): Promise<void> | void
}

/** 把安全判定转换为关热、延时停泵、故障上报等确定性保护动作。 */
export const createAutomationProtection = ({
  clock,
  actuator,
  getState,
  getActualPump,
  getActualHeater,
  getCoolingDelaySeconds,
  enterFault,
  resetTemperatureControl,
  refreshSafetyContext,
  setLimitation,
  disableMaster,
  reportFault,
}: Dependencies) => {
  let reportedFaultCode: SafetyFaultCode | null = null
  let faultPumpStopAt: number | null = null
  let faultRecorded = false
  let faultRecordError: string | null = null
  let reportingGeneration = 0
  let lastHeaterCloseAttempt = Number.NEGATIVE_INFINITY
  let lastPumpCloseAttempt = Number.NEGATIVE_INFINITY

  /**
   * 根据保护决定关闭加热或水泵，避免重复发布已满足的关闭指令。
   * @param topic 控制配置使用的业务主题，例如 master、pump 或 heater。
   * @param firstEntry 窗口内最早的一条累计量记录。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const closeIfNeeded = async (
    topic: 'pump' | 'heater',
    firstEntry: boolean,
  ) => {
    // 故障期间定时器会反复要求保护。若设备已反馈关闭或刚重试过，
    // 就避免每个 tick 重发同一条关机指令；首次进入故障仍强制尝试。
    const actual = topic === 'pump' ? getActualPump() : getActualHeater()
    if (!firstEntry && actual === 'off') return
    const lastAttempt = topic === 'pump'
      ? lastPumpCloseAttempt
      : lastHeaterCloseAttempt
    if (!firstEntry && clock() - lastAttempt < 1_000) return
    if (topic === 'pump') lastPumpCloseAttempt = clock()
    else lastHeaterCloseAttempt = clock()
    await actuator.run(topic, 'off', true)
  }

  return {
    /**
     * 执行一次自动控制业务操作，按照模块规则更新状态和外部副作用。
     * @param decision 安全监督器已经确认的故障与保护动作。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async apply(decision: SafetyDecision) {
      // 先在内存中锁定故障并把期望状态转为关闭，再发布设备关机指令。
      // 即使 MQTT 发布失败，也不能把状态机恢复成“正常运行”。
      const firstEntry = getState() !== 'fault'
      enterFault(decision.detail)
      resetTemperatureControl()
      actuator.adoptDesired('heater', 'off')
      if (decision.stopPump) actuator.adoptDesired('pump', 'off')
      // 部分温度故障水力通道仍安全，可保留泵限时散热；超压/低流等则立即停泵。
      else faultPumpStopAt ??= clock() + getCoolingDelaySeconds() * 1_000
      refreshSafetyContext()

      try {
        await closeIfNeeded('heater', firstEntry)
      }
      catch (error) {
        setLimitation(`安全关热失败：${error instanceof Error ? error.message : String(error)}`)
      }
      if (decision.stopPump) {
        try {
          await closeIfNeeded('pump', firstEntry)
        }
        catch (error) {
          setLimitation(`安全停泵失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (firstEntry) {
        void Promise.resolve(disableMaster(decision.detail)).catch(() => undefined)
      }
      if (reportedFaultCode !== decision.faultCode) {
        // 相同故障码只上报一次。异步入库失败会留在快照中提示用户，
        // 但故障保护动作不等待数据库写入成功才执行。
        const generation = ++reportingGeneration
        reportedFaultCode = decision.faultCode
        faultRecorded = false
        faultRecordError = null
        void Promise.resolve()
          .then(() => reportFault(decision.faultCode, decision.detail))
          .then(() => {
            if (generation !== reportingGeneration) return
            faultRecorded = true
          })
          .catch((error) => {
            if (generation !== reportingGeneration) return
            faultRecordError = error instanceof Error ? error.message : String(error)
            setLimitation(`${decision.detail}；故障记录失败：${faultRecordError}`)
          })
      }
    },
    /**
     * 冷却延时结束后关闭水泵，并更新保护动作的完成状态。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async stopPumpAfterCooling() {
      // 只有限时散热故障进入这里；一到截止时间，尝试关泵直到设备反馈关闭。
      if (faultPumpStopAt === null || clock() < faultPumpStopAt) return
      actuator.adoptDesired('pump', 'off')
      if (getActualPump() === 'off') {
        faultPumpStopAt = null
        return
      }
      if (clock() - lastPumpCloseAttempt < 1_000) return
      lastPumpCloseAttempt = clock()
      await actuator.run('pump', 'off', true)
    },
    /**
     * 返回故障是否已经入库以及上报失败原因，供自动快照展示。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    reportingSnapshot() {
      return { faultRecorded, faultRecordError }
    },
    /**
     * 重置自动控制当前状态；只清理本函数负责的数据，不会隐式启动设备。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    reset() {
      reportingGeneration += 1
      reportedFaultCode = null
      faultPumpStopAt = null
      faultRecorded = false
      faultRecordError = null
      lastHeaterCloseAttempt = Number.NEGATIVE_INFINITY
      lastPumpCloseAttempt = Number.NEGATIVE_INFINITY
    },
  }
}
