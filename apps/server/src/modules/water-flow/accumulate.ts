/**
 * 阅读导航：累计水量流程：按相邻有效 L/min 读数积分为升数，超时间隔不补算，并定时持久化；页面清零需同步数据库。
 * 入口位置：modules/water-flow/accumulate.ts
 * 主要的计算逻辑地方, 可以理解为Service层
 */

import type { WaterFlowSnapshot } from '@new26interthing/shared'

import type {
  PersistedWaterFlow,
  WaterFlowRepository,
} from './types.js'
import {
  calculateVelocity,
  calculateVolumeIncrement,
} from './calculation.js'

interface Dependencies {
  repository: WaterFlowRepository
  loadPipeDiameter(deviceNumber: string): Promise<number | null>
  dataTimeoutSeconds?: number
  persistIntervalMilliseconds?: number
}

interface FlowState extends PersistedWaterFlow {
  samples: Array<{
    at: number
    flow: number
  }>
  lastSavedAt: number
}

/**
 * 创建水循环累计模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param options 调用方传入的依赖或业务选项，具体字段见参数的 TypeScript 类型。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createWaterFlowService = ({
  repository,
  loadPipeDiameter,
  dataTimeoutSeconds = 3,
  persistIntervalMilliseconds = 2_000,
}: Dependencies) => {
  /**
   * 将 L/min 流量按报文间隔积分为累计升数，并按管径换算管内流速。
   * 报文间隔超过数据超时阈值时不补算，防止断网后产生虚假累计量。
   */
  const states = new Map<string, FlowState>()

  /**
   * 取得指定设备的进程内状态；首次访问时创建默认状态。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 根据内部状态生成只读快照，避免调用方直接修改累计数据。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param state 当前设备或状态机的内部状态。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const snapshot = async (
    deviceNumber: string,
    state: FlowState,
  ): Promise<WaterFlowSnapshot> => {
    const diameter = await loadPipeDiameter(deviceNumber)
    let average = state.samples[0]?.flow ?? 0
    if (state.samples.length > 1) {
      let weightedFlow = 0
      let totalMilliseconds = 0
      for (let index = 1; index < state.samples.length; index += 1) {
        const previous = state.samples[index - 1]
        const current = state.samples[index]
        if (!previous || !current) continue
        const milliseconds = current.at - previous.at
        weightedFlow += (previous.flow + current.flow) / 2 * milliseconds
        totalMilliseconds += milliseconds
      }
      if (totalMilliseconds > 0) average = weightedFlow / totalMilliseconds
    }
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
    /**
     * 处理设备的一包实时读数，推进水循环累计状态并返回最新结果。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @param flowLitersPerMinute 当前瞬时流量，单位为升每分钟。
     * @param recordedAt 本次读数的服务器接收时间戳，单位为毫秒。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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
        state.totalVolumeLiters += calculateVolumeIncrement(
          state.lastFlowRateLitersPerMinute,
          flowLitersPerMinute,
          elapsedSeconds,
        )
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

    /**
     * 返回指定设备当前快照，供 HTTP 查询或 WebSocket 展示。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async getSnapshot(deviceNumber: string) {
      return snapshot(deviceNumber, await getState(deviceNumber))
    },

    /** 清空仅用于页面展示的一分钟流量窗口，不修改瞬时流量和累计水量。 */
    async resetRealtimeIndicators(deviceNumber: string) {
      const state = await getState(deviceNumber)
      state.samples = []
      return snapshot(deviceNumber, state)
    },

    /**
     * 重置水循环累计当前状态；只清理本函数负责的数据，不会隐式启动设备。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
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
