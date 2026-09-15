/**
 * 阅读导航：统一故障上报：单次上报负责语义映射、入库和 WebSocket 警告；是否去重由具体故障来源控制。
 * 入口位置：modules/fault/report.ts
 */

import type { FaultAlertMessage, FaultItem } from '@new26interthing/shared'

import type { FaultRepository } from './ports.js'

export interface FaultReport {
  deviceNumber: string
  errorNumber: string
  type: string
  detail?: string
  occurredAt?: string | Date
}

interface FaultReporterDependencies {
  repository: FaultRepository
  broadcast(message: FaultAlertMessage): void
  now?: () => Date
}

export interface FaultReporter {
  reportFault(report: FaultReport): Promise<FaultItem>
}

/** 统一完成中文映射入库和全局 WebSocket 告警；本函数本身不做故障去重。 */
export const createFaultReporter = ({
  repository,
  broadcast,
  now = () => new Date(),
}: FaultReporterDependencies): FaultReporter => ({
  // 一个很核心的方法, 所有告警都需要用这个方法往前端推送Websocket, 然后再调用saveFualt方法去把告警数据的错误数据给入库
  async reportFault(report) {
    // contest_admin 的 t_error_code_mapper 用 e_no/type 查出标准中文说明；
    // 如未配置，仍保存带故障编号的兜底文字，避免安全故障消失。
    const mappedMessage = await repository.findMappedMessage(report.errorNumber, report.type)
    const standardMessage = mappedMessage || `故障编号 ${report.errorNumber}（类型 ${report.type}）`
    const detail = report.detail?.trim()
    const savedFault = await repository.save({
      deviceNumber: report.deviceNumber,
      errorNumber: report.errorNumber,
      type: report.type,
      message: detail ? `${standardMessage}（${detail}）` : standardMessage,
      occurredAt: report.occurredAt || now(),
    })
    broadcast({ type: 'fault.alert', data: savedFault })
    // 必须先入库再推送，这样用户收到警告后刷新故障页面也能查询到对应记录。
    return savedFault
  },
})
