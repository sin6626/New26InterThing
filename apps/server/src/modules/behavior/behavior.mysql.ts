import type { BehaviorField, BehaviorItem, BehaviorQuery } from '@new26interthing/shared'
import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise'

import type { BehaviorRepository } from './behavior.repository.js'

interface Mapping extends RowDataPacket { f_name: string; db_name: string; p_name: string; unit: string | null; type: string | null; visible: string | null }
interface CountRow extends RowDataPacket { total: number }
const allowedColumns = new Set(Array.from({ length: 10 }, (_, index) => `field${index + 1}`))

const getMappings = async (pool: Pool, table: 't_behavior_field_mapper' | 't_sensor_field_mapper') => {
  const [rows] = await pool.query<Mapping[]>(`select f_name, db_name, p_name, unit, type, visible from ${table} order by id`)
  return rows.filter(row => allowedColumns.has(row.db_name) && Boolean(row.p_name))
}

const toField = (row: Mapping): BehaviorField => ({ key: row.p_name, label: row.f_name, unit: row.unit || '', type: row.type === '1' ? 'number' : 'string' })
const valueAtPath = (source: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, source)
const mapItem = (row: RowDataPacket, mappings: Mapping[]): BehaviorItem => ({
  id: Number(row.id), deviceNumber: row.d_no ?? null, recordedAt: row.c_time ?? null,
  fields: Object.fromEntries(mappings.map(mapping => [mapping.p_name, row[mapping.db_name] ?? null])),
})

export const createBehaviorRepository = (pool: Pool): BehaviorRepository => ({
  async getOptions() {
    const mappings = await getMappings(pool, 't_behavior_field_mapper')
    return { fields: mappings.filter(row => row.visible === '1').map(toField) }
  },
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
  async getRecognitionRows(rowIds) {
    const mappings = (await getMappings(pool, 't_sensor_field_mapper')).filter(row => row.visible === '1')
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
  async saveRecognitionResult(result, deviceNumber) {
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
