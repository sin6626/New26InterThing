/**
 * 阅读导航：共用监控配置入口：供设备离线和水力诊断读取阈值；配置不能只归某一个消费模块所有。
 * 入口位置：modules/monitoring-config/index.ts
 */

export { createMonitoringConfigLoader } from './mysql.js'
export type { MonitoringConfig } from './mysql.js'
