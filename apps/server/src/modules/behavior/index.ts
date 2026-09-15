/**
 * 阅读导航：行为数据模块入口：导出查询、识别、路由与类型；行为来自历史记录触发的 AI HTTP 识别，不来自设备行为 MQTT。
 * 入口位置：modules/behavior/index.ts
 */

export { createBehaviorRepository } from './adapters/behavior.mysql.js'
export { createRecognitionService } from './flows/recognize.js'
export type { RecognitionService } from './flows/recognize.js'
export { createBehaviorRouter } from './http.js'
export type { BehaviorRepository } from './types.js'
