/** 新项目操作历史 MySQL 适配；来源是字段，不再从备注文字猜测。 */
import type { Pool, RowDataPacket } from 'mysql2/promise'
import type { OperationLogItem, OperationLogQuery } from '@new26interthing/shared'
import type { OperationHistoryRepository } from './types.js'

/**
 * 把时间值转换成数据库和页面统一使用的本地日期时间字符串。
 * @param value 本次准备读取、转换或保存的值。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const formatDateTime = (value: string | Date) => {
  if (typeof value === 'string') return value
  /**
   * 把单个时间数字补齐为两位字符串，供日期时间格式化复用。
   * @param part 准备补齐或拼入报文的单个内容片段。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

/**
 * 把数据库行转换成共享类型，集中处理字段名、数字和空值。
 * @param row 从 MySQL 查询得到的一行原始数据。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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

/**
 * 根据查询条件生成参数化 SQL 的 WHERE 子句和值列表，避免调用方直接拼接 SQL。
 * @param query 页面提交的筛选、分页或时间范围条件。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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

/**
 * 创建操作历史模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createOperationHistoryRepository = (pool: Pool): OperationHistoryRepository => ({
  /**
   * 保存操作历史数据，并完成该写入需要的一致性处理。
   * @param event 准备写入操作历史的结构化事件。
   * @param connection 可选的 MySQL 事务连接；传入时与调用方事务一起提交。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 读取操作历史需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 按照查询条件读取操作历史列表，并返回分页或筛选结果。
   * @param query 页面提交的筛选、分页或时间范围条件。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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
