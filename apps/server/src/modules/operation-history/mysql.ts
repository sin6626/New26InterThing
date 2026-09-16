/** 新项目操作历史 MySQL 适配；来源是字段，不再从备注文字猜测。 */
import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { OperationLogItem, OperationLogQuery } from '@new26interthing/shared'
import type { OperationHistoryRepository } from './types.js'

const formatDateTime = (value: string | Date) => {
  if (typeof value === 'string') return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

const mapRow = (row: RowDataPacket): OperationLogItem => ({
  id: Number(row.id),
  operatedAt: formatDateTime(row.operate_time),
  source: row.source,
  deviceNumber: row.d_no ?? null,
  configId: row.config_id === null ? null : Number(row.config_id),
  commandName: row.direct_name ?? null,
  commandType: String(row.direct_type),
  oldValue: row.old_value ?? null,
  newValue: row.new_value ?? null,
  result: String(row.result),
})

const buildFilters = (query: OperationLogQuery) => {
  const clauses: string[] = []
  const values: string[] = []
  if (query.deviceNumber) { clauses.push('d_no = ?'); values.push(query.deviceNumber) }
  if (query.source) { clauses.push('source = ?'); values.push(query.source) }
  if (query.commandType) { clauses.push('direct_type = ?'); values.push(query.commandType) }
  if (query.result) { clauses.push('result = ?'); values.push(query.result) }
  if (query.startTime) { clauses.push('operate_time >= ?'); values.push(query.startTime) }
  if (query.endTime) { clauses.push('operate_time <= ?'); values.push(query.endTime) }
  return { where: clauses.length ? clauses.join(' and ') : '1 = 1', values }
}

export const createOperationHistoryRepository = (pool: Pool): OperationHistoryRepository => ({
  async record(event, connection) {
    const sql = `insert into t_operation_history
      (source, trigger_mode, direct_type, d_no, config_id, direct_name,
       old_value, new_value, result, related_id)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    const values = [
      event.source,
      event.triggerMode ?? null,
      event.commandType,
      event.deviceNumber ?? null,
      event.configId ?? null,
      event.commandName ?? null,
      event.oldValue ?? null,
      event.newValue ?? null,
      event.result,
      event.relatedId ?? null,
    ]
    if (connection) await connection.query(sql, values)
    else await pool.query(sql, values)
  },

  async getLogOptions() {
    const [[devices], [types], [results]] = await Promise.all([
      pool.query<RowDataPacket[]>(`select distinct d_no from t_operation_history where d_no is not null order by d_no`),
      pool.query<RowDataPacket[]>(`select distinct direct_type from t_operation_history order by direct_type`),
      pool.query<RowDataPacket[]>(`select distinct result from t_operation_history order by result`),
    ])
    return {
      deviceNumbers: devices.map(row => String(row.d_no)),
      commandTypes: types.map(row => String(row.direct_type)),
      results: results.map(row => String(row.result)),
    }
  },

  async listLogs(query) {
    const { where, values } = buildFilters(query)
    const [counts] = await pool.query<RowDataPacket[]>(
      `select count(*) as total from t_operation_history where ${where}`,
      values,
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `select id, operate_time, source, direct_type, d_no, config_id, direct_name,
              old_value, new_value, result
       from t_operation_history where ${where}
       order by operate_time desc, id desc limit ? offset ?`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    )
    return { items: rows.map(mapRow), total: Number(counts[0]?.total || 0) }
  },
})
