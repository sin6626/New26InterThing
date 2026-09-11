import type { FaultAlertMessage, FaultItem } from '@new26interthing/shared'

import type { FaultRepository } from './fault.repository.js'

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

export const createFaultReporter = ({
  repository,
  broadcast,
  now = () => new Date(),
}: FaultReporterDependencies): FaultReporter => ({
  async reportFault(report) {
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
    return savedFault
  },
})
