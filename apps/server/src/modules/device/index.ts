/**
 * 阅读导航：设备模块入口：统一导出列表、在线状态与 HTTP 路由；在线由实时数据接收时间判断，不靠补发数据。
 * 入口位置：modules/device/index.ts
 */

export { createDeviceRepository } from './mysql.js'
export type { DeviceRepository } from './mysql.js'
export { createDevicePresenceService } from './presence.js'
export { createDeviceRouter } from './http.js'
