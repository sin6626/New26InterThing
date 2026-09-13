import type { SensorSafetyStatus } from '@new26interthing/shared'

export type SensorKey =
  | 'flow'
  | 'pressure'
  | 'inletTemperature'
  | 'outletTemperature'

interface SensorFact {
  value: number | null
  updatedAt: number | null
  invalid: boolean
}

const createFact = (): SensorFact => ({
  value: null,
  updatedAt: null,
  invalid: false,
})

export const createSensorFreshness = (clock: () => number) => {
  const facts: Record<SensorKey, SensorFact> = {
    flow: createFact(),
    pressure: createFact(),
    inletTemperature: createFact(),
    outletTemperature: createFact(),
  }

  const isFresh = (key: SensorKey, timeoutSeconds: number) => {
    const fact = facts[key]
    if (fact.invalid || fact.updatedAt === null) return false
    const age = clock() - fact.updatedAt
    return age >= 0 && age <= timeoutSeconds * 1_000
  }

  return {
    update(
      key: SensorKey,
      value: number | null,
      recordedAt: number,
      zeroInvalid = false,
    ) {
      const fact = facts[key]
      if (value === null) return
      if (!Number.isFinite(value) || (zeroInvalid && value === 0)) {
        fact.invalid = true
        return
      }
      fact.value = value
      fact.updatedAt = recordedAt
      fact.invalid = false
    },
    value(key: SensorKey) {
      return facts[key].value
    },
    invalidate(key: SensorKey) {
      facts[key].invalid = true
    },
    isFresh,
    status(key: SensorKey, timeoutSeconds?: number): SensorSafetyStatus {
      const fact = facts[key]
      if (fact.invalid) return 'invalid'
      if (fact.updatedAt === null || timeoutSeconds === undefined) return 'unknown'
      return isFresh(key, timeoutSeconds) ? 'ok' : 'timeout'
    },
  }
}

export type SensorFreshness = ReturnType<typeof createSensorFreshness>
