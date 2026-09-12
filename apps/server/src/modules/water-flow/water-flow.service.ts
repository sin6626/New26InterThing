import type { WaterFlowSnapshot } from '@new26interthing/shared'

import type {
  PersistedWaterFlow,
  WaterFlowRepository,
} from './water-flow.repository.js'

interface Dependencies {
  repository: WaterFlowRepository
  loadPipeDiameter(deviceNumber: string): Promise<number | null>
  dataTimeoutSeconds?: number
  persistIntervalMilliseconds?: number
}

interface FlowState extends PersistedWaterFlow {
  samples: Array<{ at: number, flow: number }>
  lastSavedAt: number
}

const calculateVelocity = (
  flowLitersPerMinute: number,
  diameterMillimeters: number,
) => {
  const diameterMeters = diameterMillimeters / 1_000
  const area = Math.PI * diameterMeters ** 2 / 4
  return flowLitersPerMinute / 60_000 / area
}

export const createWaterFlowService = ({
  repository,
  loadPipeDiameter,
  dataTimeoutSeconds = 3,
  persistIntervalMilliseconds = 2_000,
}: Dependencies) => {
  const states = new Map<string, FlowState>()

  const getState = async (deviceNumber: string) => {
    const existing = states.get(deviceNumber)
    if (existing) return existing
    const persisted = await repository.load(deviceNumber)
    const state: FlowState = {
      totalVolumeLiters: persisted?.totalVolumeLiters ?? 0,
      lastFlowRateLitersPerMinute: persisted?.lastFlowRateLitersPerMinute ?? 0,
      lastCalculatedAt: persisted?.lastCalculatedAt ?? 0,
      samples: [],
      lastSavedAt: 0,
    }
    states.set(deviceNumber, state)
    return state
  }

  const snapshot = async (
    deviceNumber: string,
    state: FlowState,
  ): Promise<WaterFlowSnapshot> => {
    const diameter = await loadPipeDiameter(deviceNumber)
    const average = state.samples.length
      ? state.samples.reduce((sum, item) => sum + item.flow, 0) / state.samples.length
      : state.lastFlowRateLitersPerMinute
    return {
      deviceNumber,
      flowRateLitersPerMinute: Number(state.lastFlowRateLitersPerMinute.toFixed(3)),
      averageFlowOneMinute: Number(average.toFixed(2)),
      flowVelocityMetersPerSecond: diameter
        ? Number(calculateVelocity(state.lastFlowRateLitersPerMinute, diameter).toFixed(3))
        : null,
      velocityStatus: diameter ? 'ok' : 'unconfigured',
      pipeInnerDiameterMillimeters: diameter,
      totalVolumeLiters: Number(state.totalVolumeLiters.toFixed(3)),
      updatedAt: state.lastCalculatedAt
        ? new Date(state.lastCalculatedAt).toISOString()
        : null,
    }
  }

  return {
    async handleReading(
      deviceNumber: string,
      flowLitersPerMinute: number,
      recordedAt: number,
    ) {
      const state = await getState(deviceNumber)
      if (!Number.isFinite(flowLitersPerMinute) || flowLitersPerMinute < 0) {
        return snapshot(deviceNumber, state)
      }
      const elapsedSeconds = state.lastCalculatedAt
        ? (recordedAt - state.lastCalculatedAt) / 1_000
        : 0
      if (elapsedSeconds > 0 && elapsedSeconds <= dataTimeoutSeconds) {
        state.totalVolumeLiters += (
          (state.lastFlowRateLitersPerMinute + flowLitersPerMinute) / 2
        ) * elapsedSeconds / 60
      }
      if (recordedAt > state.lastCalculatedAt) {
        state.lastCalculatedAt = recordedAt
        state.lastFlowRateLitersPerMinute = flowLitersPerMinute
        state.samples.push({ at: recordedAt, flow: flowLitersPerMinute })
        state.samples = state.samples.filter(item => recordedAt - item.at <= 60_000)
      }
      if (recordedAt - state.lastSavedAt >= persistIntervalMilliseconds) {
        state.lastSavedAt = recordedAt
        await repository.save(deviceNumber, state)
      }
      return snapshot(deviceNumber, state)
    },

    async getSnapshot(deviceNumber: string) {
      return snapshot(deviceNumber, await getState(deviceNumber))
    },

    async reset(deviceNumber: string) {
      const state = await getState(deviceNumber)
      const oldVolume = state.totalVolumeLiters
      state.totalVolumeLiters = 0
      await repository.reset(deviceNumber, oldVolume)
      return snapshot(deviceNumber, state)
    },
  }
}

export type WaterFlowService = ReturnType<typeof createWaterFlowService>
