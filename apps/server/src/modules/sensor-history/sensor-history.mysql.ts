import type { Pool, RowDataPacket } from 'mysql2/promise'

import type {
  SensorHistoryField,
  SensorHistoryItem,
  SensorHistoryQuery,
} from '@new26interthing/shared'

import type { SensorHistoryRepository } from './sensor-history.repository.js'

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

const toField = (mapping: FieldMapping): SensorHistoryField => ({
  key: mapping.p_name,
  label: mapping.f_name,
  unit: mapping.unit || '',
  type: mapping.type === '1' ? 'number' : 'string',
})

const getMappings = async (pool: Pool) => {
  const [rows] = await pool.query<FieldMapping[]>(
    `select f_name, db_name, p_name, unit, type, visible
     from t_sensor_field_mapper
     order by id`,
  )
  return rows.filter((row) => allowedColumns.has(row.db_name) && Boolean(row.p_name))
}

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
