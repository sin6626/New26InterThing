import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

import type { FaultItem, FaultQuery } from '@new26interthing/shared'

import type { FaultRepository } from './ports.js'

interface CountRow extends RowDataPacket { total: number }
interface DeviceNumberRow extends RowDataPacket { number: string }
interface FaultTypeRow extends RowDataPacket { type: string }
interface MessageRow extends RowDataPacket { e_msg: string }
interface StatisticsRow extends RowDataPacket { type: string | null; total: number }

const buildFilters = (query: Omit<FaultQuery, 'page' | 'pageSize'>) => {
  const clauses: string[] = []
  const values: string[] = []
  if (query.deviceNumber) {
    clauses.push('d_no = ?')
    values.push(query.deviceNumber)
  }
  if (query.type) {
    clauses.push('type = ?')
    values.push(query.type)
  }
  if (query.startTime) {
    clauses.push('c_time >= ?')
    values.push(query.startTime)
  }
  if (query.endTime) {
    clauses.push('c_time <= ?')
    values.push(query.endTime)
  }
  return { where: clauses.length ? clauses.join(' and ') : '1 = 1', values }
}

const mapItem = (row: RowDataPacket): FaultItem => ({
  id: Number(row.id),
  deviceNumber: row.d_no ?? null,
  errorNumber: row.e_no ?? null,
  type: row.type ?? null,
  message: row.e_msg ?? null,
  occurredAt: row.c_time ?? null,
})

const typeLabel = (type: string | null) => type ? `类型 ${type}` : '未知类型'

const formatDateTime = (value: string | Date) => {
  if (typeof value === 'string') return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

export const createFaultRepository = (pool: Pool): FaultRepository => ({
  async findMappedMessage(errorNumber, type) {
    const [rows] = await pool.query<MessageRow[]>(
      `select e_msg from t_error_code_mapper
       where e_no = ? and type = ?
       limit 1`,
      [errorNumber, type],
    )
    return rows[0]?.e_msg || null
  },

  async save(record) {
    const [result] = await pool.execute<ResultSetHeader>(
      `insert into t_error_msg (d_no, c_time, e_msg, e_no, type)
       values (?, ?, ?, ?, ?)`,
      [record.deviceNumber, record.occurredAt, record.message, record.errorNumber, record.type],
    )
    return {
      id: result.insertId,
      deviceNumber: record.deviceNumber,
      errorNumber: record.errorNumber,
      type: record.type,
      message: record.message,
      occurredAt: formatDateTime(record.occurredAt),
    }
  },

  async getOptions() {
    const [[deviceRows], [typeRows]] = await Promise.all([
      pool.query<DeviceNumberRow[]>(
        `select distinct number from t_device
         where number is not null and number != ''
         order by number`,
      ),
      pool.query<FaultTypeRow[]>(
        `select distinct type from t_error_msg
         where type is not null and type != ''
         order by type`,
      ),
    ])
    return {
      deviceNumbers: deviceRows.map((row) => row.number),
      types: typeRows.map((row) => ({ value: row.type, label: typeLabel(row.type) })),
    }
  },

  async list(query) {
    const { where, values } = buildFilters(query)
    const [countRows] = await pool.query<CountRow[]>(
      `select count(*) as total from t_error_msg where ${where}`,
      values,
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `select id, d_no, e_no, type, e_msg, c_time
       from t_error_msg
       where ${where}
       order by c_time desc, id desc
       limit ? offset ?`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    )
    return { items: rows.map(mapItem), total: Number(countRows[0]?.total ?? 0) }
  },

  async getStatistics(query) {
    const { where, values } = buildFilters(query)
    const [rows] = await pool.query<StatisticsRow[]>(
      `select type, count(*) as total
       from t_error_msg
       where ${where}
       group by type
       order by total desc, type`,
      values,
    )
    return rows.map((row) => ({
      type: row.type,
      label: typeLabel(row.type),
      count: Number(row.total),
    }))
  },
})
