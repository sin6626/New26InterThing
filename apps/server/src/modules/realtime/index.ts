/**
 * 阅读导航：实时数据模块入口：导出报文解析、历史入库、实时分流和 vstatus 判断；它是设备数据进入系统的入口。
 * 入口位置：modules/realtime/index.ts
 */

export { parseSensorMessage } from './adapters/sensor-message.js'
export { createSensorRepository } from './adapters/sensor.mysql.js'
export { createSensorRealtimeHandler } from './flows/receive.js'
export { createSensorVstatusEvaluator } from './rules/vstatus.js'
