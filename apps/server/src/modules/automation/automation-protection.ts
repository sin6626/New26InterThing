import type {
  ActuatorValue,
  AutomationState,
  SafetyFaultCode,
} from '@new26interthing/shared'

import type { SafetyDecision } from '../safety/safety.types.js'

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

  const closeIfNeeded = async (
    topic: 'pump' | 'heater',
    firstEntry: boolean,
  ) => {
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
    async apply(decision: SafetyDecision) {
      const firstEntry = getState() !== 'fault'
      enterFault(decision.detail)
      resetTemperatureControl()
      actuator.adoptDesired('heater', 'off')
      if (decision.stopPump) actuator.adoptDesired('pump', 'off')
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
    async stopPumpAfterCooling() {
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
    reportingSnapshot() {
      return { faultRecorded, faultRecordError }
    },
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
