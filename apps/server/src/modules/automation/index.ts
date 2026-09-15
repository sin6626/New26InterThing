/**
 * 阅读导航：自动控制模块对外入口：只把应用需要的创建函数和类型导出；内部状态机、规则和适配器仍在各自目录。main/app 应从这里导入。
 * 入口位置：modules/automation/index.ts
 */

export { createAutomationConfigLoader } from './adapters/config.mysql.js'
export { normalizeAutomationReading } from './adapters/reading.js'
export { createAutomationManager } from './flows/manager.js'
export type { AutomationManager } from './flows/manager.js'
export { createAutomationRouter } from './http.js'
