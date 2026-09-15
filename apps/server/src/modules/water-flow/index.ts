/**
 * 阅读导航：水量模块入口：对外提供流量累计、查询、清零与管径读取；不是设备运行指令。
 * 入口位置：modules/water-flow/index.ts
 */

export { createWaterFlowService } from './accumulate.js'
export type { WaterFlowService } from './accumulate.js'
export { createPipeDiameterLoader, createWaterFlowRepository } from './mysql.js'
