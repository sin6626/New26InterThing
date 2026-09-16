/**
 * 阅读导航：行为 MySQL 适配：读取 t_behavior_field_mapper，动态查询/写入 t_behavior_data；只允许白名单 field1~field10 防止配置值进入 SQL 列名。
 * 入口位置：modules/behavior/adapters/behavior.mysql.ts
 */

import type { BehaviorField, BehaviorItem, BehaviorQuery } from '@new26interthing/shared'
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise'

import type { BehaviorRepository } from '../types.js'

interface Mapping extends RowDataPacket { f_name: string; db_name: string; p_name: string; unit: string | null; type: string | null; visible: string | null }
interface CountRow extends RowDataPacket { total: number }
const allowedColumns = new Set(Array.from({ length: 10 }, (_, index) => `field${index + 1}`))

/**
 * 读取智能识别需要的数据或状态，并转换成调用方可以直接使用的结果。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @param table 经过白名单限制、允许查询的数据库表名。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const getMappings = async (pool: Pool, table: 't_behavior_field_mapper' | 't_sensor_field_mapper') => {
  const [rows] = await pool.query<Mapping[]>(`select f_name, db_name, p_name, unit, type, visible from ${table} order by id`)
  return rows.filter(row => allowedColumns.has(row.db_name) && Boolean(row.p_name))
}

/**
 * 把后台字段映射行转换成页面使用的字段定义。
 * @param row 从 MySQL 查询得到的一行原始数据。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const toField = (row: Mapping): BehaviorField => ({ key: row.p_name, label: row.f_name, unit: row.unit || '', type: row.type === '1' ? 'number' : 'string' })
/**
 * 按照点分路径读取嵌套对象字段，供后台动态映射配置使用。
 * @param source 动作来源，用于区分人工操作与自动控制。
 * @param path 后台配置的点分字段路径。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const valueAtPath = (source: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, source)
/**
 * 把数据库行转换成共享类型，集中处理字段名、数字和空值。
 * @param row 从 MySQL 查询得到的一行原始数据。
 * @param mappings 后台配置的字段映射集合。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const mapItem = (row: RowDataPacket, mappings: Mapping[]): BehaviorItem => ({
  id: Number(row.id), deviceNumber: row.d_no ?? null, recordedAt: row.c_time ?? null,
  fields: Object.fromEntries(mappings.map(mapping => {
    const value = row[mapping.db_name]
    if (mapping.type !== '1' || value === null || value === '') return [mapping.p_name, value ?? null]
    const number = Number(value)
    return [mapping.p_name, Number.isFinite(number) ? number : value]
  })),
})

/**
 * 创建智能识别模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createBehaviorRepository = (pool: Pool): BehaviorRepository => ({
  /**
   * 读取智能识别需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async getOptions() {
    const mappings = await getMappings(pool, 't_behavior_field_mapper')
    return { fields: mappings.filter(row => row.visible === '1').map(toField) }
  },
  /**
   * 按照查询条件读取智能识别列表，并返回分页或筛选结果。
   * @param query 页面提交的筛选、分页或时间范围条件。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async list(query) {
    const mappings = (await getMappings(pool, 't_behavior_field_mapper')).filter(row => row.visible === '1')
    const clauses: string[] = []; const values: string[] = []
    if (query.startTime) { clauses.push('c_time >= ?'); values.push(query.startTime) }
    if (query.endTime) { clauses.push('c_time <= ?'); values.push(query.endTime) }
    const where = clauses.length ? clauses.join(' and ') : '1 = 1'
    const [counts] = await pool.query<CountRow[]>(`select count(*) as total from t_behavior_data where ${where}`, values)
    const columns = mappings.map(row => row.db_name).join(', ')
    const [rows] = await pool.query<RowDataPacket[]>(
      `select id, d_no${columns ? `, ${columns}` : ''}, c_time from t_behavior_data where ${where} order by c_time desc, id desc limit ? offset ?`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    )
    return { total: Number(counts[0]?.total ?? 0), items: rows.map(row => mapItem(row, mappings)) }
  },
  /**
   * 读取智能识别需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @param rowIds 用户选择并要求识别的历史数据主键列表。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async getRecognitionRows(rowIds) {
    const mappings = await getMappings(pool, 't_sensor_field_mapper')
    const placeholders = rowIds.map(() => '?').join(', ')
    const columns = mappings.map(row => row.db_name).join(', ')
    const [rows] = await pool.query<RowDataPacket[]>(
      `select id, d_no${columns ? `, ${columns}` : ''}, c_time from t_sensor_data where id in (${placeholders}) order by c_time, id`, rowIds,
    )
    return rows.map(row => ({
      deviceNumber: row.d_no ?? null, recordedAt: row.c_time ?? null,
      ...Object.fromEntries(mappings.map(mapping => [mapping.p_name, row[mapping.db_name] ?? null])),
    }))
  },
  /**
   * 保存智能识别数据，并完成该写入需要的一致性处理。
   * @param result 本次操作或判断产生的结果。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async saveRecognitionResult(result, deviceNumber) {
    // p_name 可写嵌套路径，例如 classification.action；只有实际命中的后台
    // 字段才参与写库。db_name 已在 getMappings 通过 field1~field10 白名单过滤。
    const mappings = await getMappings(pool, 't_behavior_field_mapper')
    const matched = mappings.filter(mapping => valueAtPath(result, mapping.p_name) !== undefined)
    if (!matched.length) throw new Error('识别结果没有匹配任何行为字段，请检查行为字段映射')
    const columns = ['d_no', ...matched.map(row => row.db_name), 'c_time', 'online']
    const values = [deviceNumber, ...matched.map(row => {
      const value = valueAtPath(result, row.p_name)
      return value === null || typeof value !== 'object' ? value : JSON.stringify(value)
    }), new Date(), '识别数据']
    const [insert] = await pool.query<ResultSetHeader>(`insert into t_behavior_data (${columns.join(', ')}) values (${columns.map(() => '?').join(', ')})`, values)
    return insert.insertId
  },
})
