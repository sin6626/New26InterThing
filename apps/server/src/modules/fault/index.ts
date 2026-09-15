/**
 * 阅读导航：故障模块入口：导出查询、上报和 HTTP 路由；所有模块通过统一故障上报记录并推送警告。
 * 入口位置：modules/fault/index.ts
 */

export { createFaultRepository } from './mysql.js'
export { createFaultReporter } from './report.js'
export { createFaultRouter } from './http.js'
export type { FaultRepository } from './ports.js'
