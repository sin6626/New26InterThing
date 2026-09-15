/**
 * 阅读导航：进程内运行指标：只根据设备实际泵/加热反馈累计时间，超时不补算；服务重启后从零开始。
 * 入口位置：modules/operational-metrics/runtime.ts
 */

interface OperationalReading {
  recordedAt: number
  actualPump: 'on' | 'off' | 'unknown'
  actualHeater: 'on' | 'off' | 'unknown'
  outletTemperature: number | null
}

interface TemperatureSample {
  recordedAt: number
  value: number
}

interface OperationalState {
  pumpRuntimeSeconds: number
  heaterRuntimeSeconds: number
  lastCalculatedAt: number
  lastPumpState: OperationalReading['actualPump']
  lastHeaterState: OperationalReading['actualHeater']
  outletTemperatureSamples: TemperatureSample[]
  outletHeatingRatePerMinute: number | null
}

interface Options {
  dataTimeoutSeconds?: number
  loadDataTimeoutSeconds?: () => Promise<number>
  temperatureWindowSeconds?: number
}

export const createOperationalMetricsService = ({
  dataTimeoutSeconds = 3,
  loadDataTimeoutSeconds = async () => dataTimeoutSeconds,
  temperatureWindowSeconds = 60,
}: Options = {}) => {
  /**
   * 计算进程内现场指标：泵/加热运行秒数和出口温度每分钟变化。
   * 只认设备实际反馈，不按页面期望状态计时；服务重启后从零统计。
   */
  const states = new Map<string, OperationalState>()

  const getState = (deviceNumber: string) => {
    const existing = states.get(deviceNumber)
    if (existing) return existing
    const state: OperationalState = {
      pumpRuntimeSeconds: 0,
      heaterRuntimeSeconds: 0,
      lastCalculatedAt: 0,
      lastPumpState: 'unknown',
      lastHeaterState: 'unknown',
      outletTemperatureSamples: [],
      outletHeatingRatePerMinute: null,
    }
    states.set(deviceNumber, state)
    return state
  }

  const getSnapshot = (deviceNumber: string) => {
    const state = getState(deviceNumber)
    return {
      deviceNumber,
      pumpRuntimeSeconds: Number(state.pumpRuntimeSeconds.toFixed(1)),
      heaterRuntimeSeconds: Number(state.heaterRuntimeSeconds.toFixed(1)),
      actualPump: state.lastPumpState,
      actualHeater: state.lastHeaterState,
      outletHeatingRatePerMinute: state.outletHeatingRatePerMinute,
      updatedAt: state.lastCalculatedAt
        ? new Date(state.lastCalculatedAt).toISOString()
        : null,
    }
  }

  return {
    async handleReading(deviceNumber: string, reading: OperationalReading) {
      const state = getState(deviceNumber)
      const currentDataTimeoutSeconds = await loadDataTimeoutSeconds()
      const elapsedSeconds = state.lastCalculatedAt
        ? (reading.recordedAt - state.lastCalculatedAt) / 1_000
        : 0

      if (
        elapsedSeconds > 0
        && elapsedSeconds <= currentDataTimeoutSeconds
      ) {
        if (reading.actualPump === 'on') {
          state.pumpRuntimeSeconds += elapsedSeconds
        }
        if (reading.actualHeater === 'on') {
          state.heaterRuntimeSeconds += elapsedSeconds
        }
      }

      if (reading.recordedAt > state.lastCalculatedAt) {
        state.lastCalculatedAt = reading.recordedAt
        state.lastPumpState = reading.actualPump
        state.lastHeaterState = reading.actualHeater

        if (
          reading.outletTemperature !== null
          && Number.isFinite(reading.outletTemperature)
        ) {
          state.outletTemperatureSamples.push({
            recordedAt: reading.recordedAt,
            value: reading.outletTemperature,
          })
          const windowMilliseconds = temperatureWindowSeconds * 1_000
          state.outletTemperatureSamples = state.outletTemperatureSamples.filter(
            sample => reading.recordedAt - sample.recordedAt <= windowMilliseconds,
          )
          const oldest = state.outletTemperatureSamples[0]
          if (oldest) {
            const sampleSeconds = (reading.recordedAt - oldest.recordedAt) / 1_000
            state.outletHeatingRatePerMinute = sampleSeconds >= 5
              ? Number((
                  (reading.outletTemperature - oldest.value)
                  / sampleSeconds
                  * 60
                ).toFixed(2))
              : null
          }
        }
      }

      return getSnapshot(deviceNumber)
    },
    getSnapshot,
  }
}

export type OperationalMetricsService = ReturnType<
  typeof createOperationalMetricsService
>
