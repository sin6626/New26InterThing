/**
 * 阅读导航：故障 MySQL 适配：按 t_error_code_mapper 取得中文语义，再写 t_error_msg；同时提供过滤、统计与分页查询。
 * 入口位置：modules/fault/mysql.ts
 * 所有有关数据库的操作, 报错的数据入库, 查询数据给前端页面渲染都在这里
 */

import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

import type { FaultItem, FaultQuery } from '@new26interthing/shared'

import type { FaultRepository } from './ports.js'

interface CountRow extends RowDataPacket { total: number }
interface DeviceNumberRow extends RowDataPacket { number: string }
interface FaultTypeRow extends RowDataPacket { type: string }
interface MessageRow extends RowDataPacket { e_msg: string }
interface StatisticsRow extends RowDataPacket { type: string | null; total: number }

/**
 * 根据查询条件生成参数化 SQL 的 WHERE 子句和值列表，避免调用方直接拼接 SQL。
 * @param query 页面提交的筛选、分页或时间范围条件。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const buildFilters = (query: Omit<FaultQuery, 'page' | 'pageSize'>) => {
  const clauses: string[] = []
  const values: string[] = []
  if (query.deviceNumber) {
    clauses.push('fault.d_no = ?')
    values.push(query.deviceNumber)
  }
  if (query.type) {
    clauses.push('fault.type = ?')
    values.push(query.type)
  }
  if (query.source) {
    clauses.push("coalesce(fault_source.source, 'system') = ?")
    values.push(query.source)
  }
  if (query.startTime) {
    clauses.push('fault.c_time >= ?')
    values.push(query.startTime)
  }
  if (query.endTime) {
    clauses.push('fault.c_time <= ?')
    values.push(query.endTime)
  }
  return { where: clauses.length ? clauses.join(' and ') : '1 = 1', values }
}

/**
 * 把数据库行转换成共享类型，集中处理字段名、数字和空值。
 * @param row 从 MySQL 查询得到的一行原始数据。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const mapSource = (value: unknown): FaultItem['source'] => {
  if (value === null || value === undefined || value === 'system') return 'system'
  if (value === 'intelligence') return 'intelligence'
  throw new Error(`未知故障来源：${String(value)}`)
}

const mapItem = (row: RowDataPacket): FaultItem => ({
  id: Number(row.id),
  deviceNumber: row.d_no ?? null,
  errorNumber: row.e_no ?? null,
  type: row.type ?? null,
  source: mapSource(row.source),
  message: row.e_msg ?? null,
  occurredAt: row.c_time ?? null,
})

/**
 * 把数据库故障类型编码转换成页面可读的中文分类。
 * @param type 数据库或业务协议使用的类型编码。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const typeLabel = (type: string | null) => type ? `类型 ${type}` : '未知类型'

/**
 * 把时间值转换成数据库和页面统一使用的本地日期时间字符串。
 * @param value 本次准备读取、转换或保存的值。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const formatDateTime = (value: string | Date) => {
  if (typeof value === 'string') return value
  // 字符串长度不够往前补0逻辑
  /**
   * 把单个时间数字补齐为两位字符串，供日期时间格式化复用。
   * @param part 准备补齐或拼入报文的单个内容片段。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const pad = (part: number) => String(part).padStart(2, '0')
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
}

/**
 * 创建故障信息模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createFaultRepository = (pool: Pool): FaultRepository => ({
  /**
   * 按照故障编号和类型读取后台配置的标准中文故障说明。
   * @param errorNumber 与后台错误语义映射表对应的故障编号。
   * @param type 数据库或业务协议使用的类型编码。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async findMappedMessage(errorNumber, type) {
    const [rows] = await pool.query<MessageRow[]>(
      `select e_msg from t_error_code_mapper
       where e_no = ? and type = ?
       limit 1`,
      [errorNumber, type],
    )
    return rows[0]?.e_msg || null
  },

  /**
   * 保存故障信息数据，并完成该写入需要的一致性处理。
   * @param record 当前准备转换、判断或保存的数据记录。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async save(record) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      const [result] = await connection.execute<ResultSetHeader>(
        `insert into t_error_msg (d_no, c_time, e_msg, e_no, type)
         values (?, ?, ?, ?, ?)`,
        [record.deviceNumber, record.occurredAt, record.message, record.errorNumber, record.type],
      )
      await connection.execute(
        `insert into t_error_source (fault_id, source)
         values (?, ?)`,
        [result.insertId, record.source],
      )
      await connection.commit()
      return {
        id: result.insertId,
        deviceNumber: record.deviceNumber,
        errorNumber: record.errorNumber,
        type: record.type,
        source: record.source,
        message: record.message,
        occurredAt: formatDateTime(record.occurredAt),
      }
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  },

  /**
   * 读取故障信息需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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
      sources: [
        { value: 'system', label: '系统判定' },
        { value: 'intelligence', label: '智能判定' },
      ],
    }
  },

  /**
   * 按照查询条件读取故障信息列表，并返回分页或筛选结果。
   * @param query 页面提交的筛选、分页或时间范围条件。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async list(query) {
    const { where, values } = buildFilters(query)
    const [countRows] = await pool.query<CountRow[]>(
      `select count(*) as total
       from t_error_msg fault
       left join t_error_source fault_source on fault_source.fault_id = fault.id
       where ${where}`,
      values,
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `select fault.id, fault.d_no, fault.e_no, fault.type, fault.e_msg, fault.c_time,
              coalesce(fault_source.source, 'system') as source
       from t_error_msg fault
       left join t_error_source fault_source on fault_source.fault_id = fault.id
       where ${where}
       order by fault.c_time desc, fault.id desc
       limit ? offset ?`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    )
    return { items: rows.map(mapItem), total: Number(countRows[0]?.total ?? 0) }
  },

  /**
   * 读取故障信息需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @param query 页面提交的筛选、分页或时间范围条件。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async getStatistics(query) {
    const { where, values } = buildFilters(query)
    const [rows] = await pool.query<StatisticsRow[]>(
      `select fault.type, count(*) as total
       from t_error_msg fault
       left join t_error_source fault_source on fault_source.fault_id = fault.id
       where ${where}
       group by fault.type
       order by total desc, fault.type`,
      values,
    )
    return rows.map((row) => ({
      type: row.type,
      label: typeLabel(row.type),
      count: Number(row.total),
    }))
  },
})
