/**
 * 阅读导航：传感器超时规则：分别检查压力、流量和温度是否新鲜，不能用整包到达时间掩盖某个字段过期。
 * 入口位置：modules/safety/rules/sensor-timeout.ts
 */

import type { SafetyFaultCode } from '../types.js'

/**
 * 读取安全保护需要的数据或状态，并转换成调用方可以直接使用的结果。
 * @param options 调用方传入的依赖或业务选项，具体字段见参数的 TypeScript 类型。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const getSensorTimeoutFault = ({
  active,
  pressureFresh,
  flowFresh,
  inletTemperatureFresh,
  outletTemperatureFresh,
}: {
  active: boolean
  pressureFresh: boolean
  flowFresh: boolean
  inletTemperatureFresh: boolean
  outletTemperatureFresh: boolean
}): SafetyFaultCode | null => {
  // 停止状态无需因某传感器暂时没有报数而锁运行故障；运行时必须逐字段检查。
  if (!active) return null
  // 这里的顺序也是同一时刻多个字段都超时时的主故障优先级。
  if (!pressureFresh) return 'SENSOR_PRESSURE_TIMEOUT'
  if (!flowFresh) return 'SENSOR_FLOW_TIMEOUT'
  if (!inletTemperatureFresh || !outletTemperatureFresh) {
    return 'SENSOR_TEMPERATURE_TIMEOUT'
  }
  return null
}
