/**
 * 阅读导航：历史数据 MySQL 适配：按后台传感器字段映射动态查询、筛选和按分钟趋势聚合；字段列名只使用白名单。
 * 入口位置：modules/sensor-history/mysql.ts
 */

import type { Pool, RowDataPacket } from 'mysql2/promise'

import type {
  SensorHistoryField,
  SensorHistoryItem,
  SensorHistoryQuery,
} from '@new26interthing/shared'

import type { SensorHistoryRepository } from './types.js'

interface FieldMapping extends RowDataPacket {
  f_name: string
  db_name: string
  p_name: string
  unit: string | null
  type: string | null
  visible: string | null
}

interface CountRow extends RowDataPacket { total: number }
interface DeviceNumberRow extends RowDataPacket { number: string }

const allowedColumns = new Set(Array.from({ length: 10 }, (_, index) => `field${index + 1}`))

/**
 * 把后台字段映射行转换成页面使用的字段定义。
 * @param mapping 单条后台字段映射配置。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const toField = (mapping: FieldMapping): SensorHistoryField => ({
  key: mapping.p_name,
  label: mapping.f_name,
  unit: mapping.unit || '',
  type: mapping.type === '1' ? 'number' : 'string',
})

/**
 * 读取传感器历史需要的数据或状态，并转换成调用方可以直接使用的结果。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const getMappings = async (pool: Pool) => {
  const [rows] = await pool.query<FieldMapping[]>(
    `select f_name, db_name, p_name, unit, type, visible
     from t_sensor_field_mapper
     order by id`,
  )
  return rows.filter((row) => allowedColumns.has(row.db_name) && Boolean(row.p_name))
}

/**
 * 根据查询条件生成参数化 SQL 的 WHERE 子句和值列表，避免调用方直接拼接 SQL。
 * @param query 页面提交的筛选、分页或时间范围条件。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const buildFilters = (query: Omit<SensorHistoryQuery, 'page' | 'pageSize'>) => {
  const clauses: string[] = []
  const values: Array<string> = []
  if (query.deviceNumber) {
    clauses.push('d_no = ?')
    values.push(query.deviceNumber)
  }
  if (query.startTime) {
    clauses.push('c_time >= ?')
    values.push(query.startTime)
  }
  if (query.endTime) {
    clauses.push('c_time <= ?')
    values.push(query.endTime)
  }
  if (query.status === 'normal') clauses.push('vstatus = 0')
  if (query.status === 'abnormal') clauses.push('vstatus != 0')
  return { where: clauses.length ? clauses.join(' and ') : '1 = 1', values }
}

/**
 * 把数据库行转换成共享类型，集中处理字段名、数字和空值。
 * @param row 从 MySQL 查询得到的一行原始数据。
 * @param mappings 后台配置的字段映射集合。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const mapItem = (row: RowDataPacket, mappings: FieldMapping[]): SensorHistoryItem => ({
  id: Number(row.id),
  deviceNumber: row.d_no ?? null,
  fields: Object.fromEntries(mappings.map((mapping) => {
    const value = row[mapping.db_name]
    if (mapping.type !== '1' || value === null || value === '') return [mapping.p_name, value ?? null]
    const numericValue = Number(value)
    return [mapping.p_name, Number.isFinite(numericValue) ? numericValue : value]
  })),
  status: Number(row.vstatus ?? 0) === 0 ? 'normal' : 'alarm',
  statusCode: Number(row.vstatus ?? 0),
  online: row.online ?? null,
  recordedAt: row.c_time ?? null,
})

/** 历史查询适配器：负责动态列、条件分页和按分钟归并趋势。 */
export const createSensorHistoryRepository = (pool: Pool): SensorHistoryRepository => ({
  /**
   * 读取传感器历史需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async getOptions() {
    const [mappings, [deviceRows]] = await Promise.all([
      getMappings(pool),
      pool.query<DeviceNumberRow[]>(
        `select distinct number from t_device
         where number is not null and number != ''
         order by number`,
      ),
    ])
    return {
      deviceNumbers: deviceRows.map((row) => row.number),
      fields: mappings.filter((mapping) => mapping.visible === '1').map(toField),
    }
  },

  /**
   * 按照查询条件读取传感器历史列表，并返回分页或筛选结果。
   * @param query 页面提交的筛选、分页或时间范围条件。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async list(query) {
    const mappings = (await getMappings(pool)).filter((mapping) => mapping.visible === '1')
    const { where, values } = buildFilters(query)
    const [countRows] = await pool.query<CountRow[]>(
      `select count(*) as total from t_sensor_data where ${where}`,
      values,
    )
    const selectedColumns = mappings.map((mapping) => mapping.db_name).join(', ')
    const [rows] = await pool.query<RowDataPacket[]>(
      `select id, d_no${selectedColumns ? `, ${selectedColumns}` : ''}, vstatus, online, c_time
       from t_sensor_data
       where ${where}
       order by c_time desc, id desc
       limit ? offset ?`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    )
    return {
      total: Number(countRows[0]?.total ?? 0),
      items: rows.map((row) => mapItem(row, mappings)),
    }
  },

  /**
   * 读取传感器历史需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @param query 页面提交的筛选、分页或时间范围条件。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async getTrend(query) {
    const mappings = (await getMappings(pool)).filter(
      (mapping) => mapping.visible === '1' && mapping.type === '1',
    )
    if (!mappings.length) return { times: [], series: [] }
    const { where, values } = buildFilters(query)
    const averages = mappings.map(
      (mapping) => `round(avg(cast(${mapping.db_name} as decimal(20, 6))), 2) as ${mapping.db_name}`,
    ).join(', ')
    const [descendingRows] = await pool.query<RowDataPacket[]>(
      `select date_format(c_time, '%Y-%m-%d %H:%i:00') as minute_time, ${averages}
       from t_sensor_data
       where ${where}
       group by minute_time
       order by minute_time desc
       limit ?`,
      [...values, query.limit],
    )
    const rows = [...descendingRows].reverse()
    return {
      times: rows.map((row) => String(row.minute_time)),
      series: mappings.map((mapping) => ({
        key: mapping.p_name,
        name: mapping.f_name,
        unit: mapping.unit || '',
        data: rows.map((row) => row[mapping.db_name] === null ? null : Number(row[mapping.db_name])),
      })),
    }
  },
})
