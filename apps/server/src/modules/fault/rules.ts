import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { FaultRuleConfig, UpdateFaultRuleConfig } from '@new26interthing/shared'
import type { OperationHistoryRepository } from '../operation-history/index.js'

const mapRule = (row: RowDataPacket): FaultRuleConfig => ({
  faultCode: String(row.fault_code),
  name: String(row.fault_name),
  category: row.category,
  protectionEnabled: Boolean(row.protection_enabled),
  protectionLocked: Boolean(row.protection_locked),
  recordEnabled: Boolean(row.record_enabled),
  notificationEnabled: Boolean(row.notification_enabled),
})

export const createFaultRuleService = (pool: Pool, history: OperationHistoryRepository) => {
  const get = async (faultCode: string) => {
    const [rows] = await pool.query<RowDataPacket[]>(
      'select * from t_fault_rule_config where fault_code = ? limit 1',
      [faultCode],
    )
    return rows[0] ? mapRule(rows[0]) : null
  }
  return {
    async list() {
      const [rows] = await pool.query<RowDataPacket[]>(
        'select * from t_fault_rule_config order by category, fault_code',
      )
      return rows.map(mapRule)
    },
    get,
    async update(faultCode: string, input: UpdateFaultRuleConfig) {
      const current = await get(faultCode)
      if (!current) {
        throw Object.assign(new Error('未找到告警规则'), { status: 404 })
      }
      const protectionEnabled = current.protectionLocked ? true : input.protectionEnabled
      const connection = await pool.getConnection()
      try {
        await connection.beginTransaction()
        await connection.query(
          `update t_fault_rule_config
           set protection_enabled = ?, record_enabled = ?, notification_enabled = ?
           where fault_code = ?`,
          [protectionEnabled, input.recordEnabled, input.notificationEnabled, faultCode],
        )
        await history.record({
          source: 'application',
          triggerMode: 'manual',
          commandType: 'fault_rule_config',
          commandName: `告警配置：${current.name}`,
          oldValue: JSON.stringify(current),
          newValue: JSON.stringify({ ...input, protectionEnabled }),
          result: 'success',
        }, connection)
        await connection.commit()
      }
      catch (error) {
        await connection.rollback()
        throw error
      }
      finally {
        connection.release()
      }
      return get(faultCode)
    },
  }
}
export type FaultRuleService = ReturnType<typeof createFaultRuleService>
