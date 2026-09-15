/**
 * 阅读导航：安全模块入口：提供监督器与故障类型映射；人工和自动设备动作共用这里的安全授权。
 * 入口位置：modules/safety/index.ts
 */

export { getHydraulicFaultType, getSafetyFaultType } from './faults/catalog.js'
export { createSafetySupervisor } from './state/supervisor.js'
export type { SafetySupervisor } from './state/supervisor.js'
