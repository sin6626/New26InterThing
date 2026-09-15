/**
 * 阅读导航：水力诊断模块入口：对外提供读数诊断管理器；纯分类、持续确认和告警副作用在内部不同层处理。
 * 入口位置：modules/diagnostics/index.ts
 */

export { createHydraulicDiagnosisManager } from './flows/diagnose.js'
