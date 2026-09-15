/**
 * 阅读导航：现场运行指标入口：对外提供泵/加热累计时长与温升速度；指标仅供展示，不替代安全判断。
 * 入口位置：modules/operational-metrics/index.ts
 */

export { createOperationalMetricsService } from './runtime.js'
export type { OperationalMetricsService } from './runtime.js'
