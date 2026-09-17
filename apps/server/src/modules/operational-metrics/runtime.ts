/**
 * 阅读导航：实时运行指标：只根据设备实际泵/加热反馈累计时间，超时不补算，并定时持久化供重启恢复。
 * 入口位置：modules/operational-metrics/runtime.ts
 */

import { calculateTemperatureRatePerMinute } from './calculation.js'
import type {
  OperationalMetricsRepository,
  OperationalSwitchState,
} from './types.js'

interface OperationalReading {
  recordedAt: number
  actualPump: OperationalSwitchState
  actualHeater: OperationalSwitchState
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
  lastSavedAt: number
}

interface Options {
  repository?: OperationalMetricsRepository
  dataTimeoutSeconds?: number
  loadDataTimeoutSeconds?: () => Promise<number>
  temperatureWindowSeconds?: number
  persistIntervalMilliseconds?: number
}

const emptyRepository: OperationalMetricsRepository = {
  load: async () => null,
  save: async () => undefined,
  reset: async () => undefined,
}

/**
 * 创建运行指标模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param options 调用方传入的依赖或业务选项，具体字段见参数的 TypeScript 类型。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createOperationalMetricsService = ({
  repository = emptyRepository,
  dataTimeoutSeconds = 3,
  loadDataTimeoutSeconds = async () => dataTimeoutSeconds,
  temperatureWindowSeconds = 60,
  persistIntervalMilliseconds = 2_000,
}: Options = {}) => {
  /**
   * 计算进程内现场指标：泵/加热运行秒数和出口温度每分钟变化。
   * 只认设备实际反馈，不按页面期望状态计时；服务重启后从数据库恢复。
   */
  const states = new Map<string, OperationalState>()

  /**
   * 取得指定设备的进程内状态；首次访问时创建默认状态。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const getState = async (deviceNumber: string) => {
    const existing = states.get(deviceNumber)
    if (existing) return existing
    const persisted = await repository.load(deviceNumber)
    const state: OperationalState = {
      pumpRuntimeSeconds: persisted?.pumpRuntimeSeconds ?? 0,
      heaterRuntimeSeconds: persisted?.heaterRuntimeSeconds ?? 0,
      lastCalculatedAt: persisted?.lastCalculatedAt ?? 0,
      lastPumpState: persisted?.lastPumpState ?? 'unknown',
      lastHeaterState: persisted?.lastHeaterState ?? 'unknown',
      outletTemperatureSamples: [],
      outletHeatingRatePerMinute: null,
      lastSavedAt: 0,
    }
    states.set(deviceNumber, state)
    return state
  }

  /**
   * 返回指定设备当前快照，供 HTTP 查询或 WebSocket 展示。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const snapshot = (deviceNumber: string, state: OperationalState) => {
    return {
      deviceNumber,
      pumpRuntimeSeconds: Number(state.pumpRuntimeSeconds.toFixed(1)), // 水泵累计运行时间
      heaterRuntimeSeconds: Number(state.heaterRuntimeSeconds.toFixed(1)), // 加热累计运行时间
      actualPump: state.lastPumpState,
      actualHeater: state.lastHeaterState,
      outletHeatingRatePerMinute: state.outletHeatingRatePerMinute, // 出口水温上升的速率
      updatedAt: state.lastCalculatedAt
        ? new Date(state.lastCalculatedAt).toISOString()
        : null,
    }
  }

  return {
    /**
     * 处理设备的一包实时读数，推进运行指标状态并返回最新结果。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param reading 已经规范化的本次设备实时读数。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async handleReading(deviceNumber: string, reading: OperationalReading) {
      const state = await getState(deviceNumber)
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
          state.outletHeatingRatePerMinute = calculateTemperatureRatePerMinute(
            oldest,
            {
              recordedAt: reading.recordedAt,
              value: reading.outletTemperature,
            },
          )
        }
      }
      if (reading.recordedAt - state.lastSavedAt >= persistIntervalMilliseconds) {
        state.lastSavedAt = reading.recordedAt
        await repository.save(deviceNumber, state)
      }
      return snapshot(deviceNumber, state)
    },
    async getSnapshot(deviceNumber: string) {
      return snapshot(deviceNumber, await getState(deviceNumber))
    },
    async reset(deviceNumber: string) {
      const state = await getState(deviceNumber)
      const oldPumpRuntimeSeconds = state.pumpRuntimeSeconds
      const oldHeaterRuntimeSeconds = state.heaterRuntimeSeconds
      await repository.reset(
        deviceNumber,
        oldPumpRuntimeSeconds,
        oldHeaterRuntimeSeconds,
      )
      state.pumpRuntimeSeconds = 0
      state.heaterRuntimeSeconds = 0
      state.lastCalculatedAt = 0
      state.lastPumpState = 'unknown'
      state.lastHeaterState = 'unknown'
      state.lastSavedAt = 0
      return snapshot(deviceNumber, state)
    },
  }
}

export type OperationalMetricsService = ReturnType<
  typeof createOperationalMetricsService
>
