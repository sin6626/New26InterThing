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
  getCoolingDelaySeconds(): number
  enterFault(detail: string): void
  resetTemperatureControl(): void
  refreshSafetyContext(): void
  setLimitation(reason: string): void
  disableMaster(reason: string): Promise<void> | void
  reportFault(errorNumber: SafetyFaultCode, detail: string): Promise<void> | void
}

export const createAutomationProtection = ({
  clock,
  actuator,
  getState,
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
        await actuator.run('heater', 'off', firstEntry)
      }
      catch (error) {
        setLimitation(`安全关热失败：${error instanceof Error ? error.message : String(error)}`)
      }
      if (decision.stopPump) {
        try {
          await actuator.run('pump', 'off', firstEntry)
        }
        catch (error) {
          setLimitation(`安全停泵失败：${error instanceof Error ? error.message : String(error)}`)
        }
      }
      if (firstEntry) {
        await Promise.resolve(disableMaster(decision.detail)).catch(() => undefined)
      }
      if (reportedFaultCode !== decision.faultCode) {
        reportedFaultCode = decision.faultCode
        faultRecorded = false
        faultRecordError = null
        await Promise.resolve(reportFault(decision.faultCode, decision.detail)).catch((error) => {
          faultRecordError = error instanceof Error ? error.message : String(error)
          setLimitation(`${decision.detail}；故障记录失败：${faultRecordError}`)
        })
        if (faultRecordError === null) faultRecorded = true
      }
    },
    async stopPumpAfterCooling() {
      if (faultPumpStopAt === null || clock() < faultPumpStopAt) return
      await actuator.run('pump', 'off', true)
      faultPumpStopAt = null
    },
    reportingSnapshot() {
      return { faultRecorded, faultRecordError }
    },
    reset() {
      reportedFaultCode = null
      faultPumpStopAt = null
      faultRecorded = false
      faultRecordError = null
    },
  }
}
