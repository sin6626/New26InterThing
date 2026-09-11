import type { FaultRepository } from './fault.repository.js'
import type { FaultMessage } from './fault-message.js'

export const createFaultHandler = (repository: FaultRepository) => async (fault: FaultMessage) => {
  const mappedMessage = await repository.findMappedMessage(fault.errorNumber, fault.type)
  const message = mappedMessage || fault.message || `故障编号 ${fault.errorNumber}（类型 ${fault.type}）`
  await repository.save({ ...fault, message })
}
