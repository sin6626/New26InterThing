/**
 * 阅读导航：传感器新鲜度状态：四类读数各自记录值与最后有效时间；同一个 MQTT 包不一定包含所有字段。
 * 入口位置：modules/safety/state/freshness.ts
 */

import type { SensorSafetyStatus } from '@new26interthing/shared'
import { isValidSensorValue } from '../rules/sensor-value.js'

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

/**
 * 创建安全保护模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const createFact = (): SensorFact => ({
  value: null,
  updatedAt: null,
  invalid: false,
})

/** 分别记录四类传感器的值和到达时间，避免一类新数据掩盖另一类超时。 */
export const createSensorFreshness = (clock: () => number) => {
  const facts: Record<SensorKey, SensorFact> = {
    flow: createFact(),
    pressure: createFact(),
    inletTemperature: createFact(),
    outletTemperature: createFact(),
  }

  /**
   * 判断指定传感器事实是否仍在数据超时时间内有效。
   * @param key 需要读取、更新或校验的状态字段名称。
   * @param timeoutSeconds 允许等待的最长秒数。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const isFresh = (key: SensorKey, timeoutSeconds: number) => {
    const fact = facts[key]
    if (fact.invalid || fact.updatedAt === null) return false
    const age = clock() - fact.updatedAt
    return age >= 0 && age <= timeoutSeconds * 1_000
  }

  return {
    /**
     * 更新安全保护状态，并返回或广播更新后的结果。
     * @param key 需要读取、更新或校验的状态字段名称。
     * @param value 本次准备读取、转换或保存的值。
     * @param recordedAt 本次读数的服务器接收时间戳，单位为毫秒。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    update(
      key: SensorKey,
      value: number | null,
      recordedAt: number,
    ) {
      const fact = facts[key]
      if (value === null) return
      if (!isValidSensorValue(value)) {
        fact.invalid = true
        return
      }
      fact.value = value
      fact.updatedAt = recordedAt
      fact.invalid = false
    },
    /**
     * 返回指定传感器最近一次有效数值；无有效事实时返回空值。
     * @param key 需要读取、更新或校验的状态字段名称。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    value(key: SensorKey) {
      return facts[key].value
    },
    isFresh,
    /**
     * 根据最近值和更新时间返回传感器正常、无效或超时状态。
     * @param key 需要读取、更新或校验的状态字段名称。
     * @param timeoutSeconds 允许等待的最长秒数。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    status(key: SensorKey, timeoutSeconds?: number): SensorSafetyStatus {
      const fact = facts[key]
      if (fact.invalid) return 'invalid'
      if (fact.updatedAt === null || timeoutSeconds === undefined) return 'unknown'
      return isFresh(key, timeoutSeconds) ? 'ok' : 'timeout'
    },
  }
}

export type SensorFreshness = ReturnType<typeof createSensorFreshness>
