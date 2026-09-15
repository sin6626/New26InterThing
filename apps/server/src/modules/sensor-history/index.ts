/**
 * 阅读导航：历史传感器模块入口：导出分页、字段选项和趋势查询；历史记录不会反向触发自动控制。
 * 入口位置：modules/sensor-history/index.ts
 */

export { createSensorHistoryRepository } from './mysql.js'
export { createSensorHistoryRouter } from './http.js'
export type { SensorHistoryRepository } from './types.js'
