import type {
  Pool,
  RowDataPacket,
} from 'mysql2/promise'

import type {
  ControlField,
  ControlOption,
  OperationLogItem,
  OperationLogQuery,
} from '@new26interthing/shared'

import type {
  ControlDefinition,
  ControlRepository,
} from './control.repository.js'
import { isDeviceCommand } from './control-policy.js'

const fieldTypes: Record<string, ControlField['type']> = {
  '1': 'switch',
  '2': 'input',
  '3': 'slider',
  '4': 'datetime',
  '5': 'radio',
  '6': 'checkbox',
}

const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

const parseOptions = (value: unknown): ControlOption[] => {
  let values: unknown = value
  if (typeof value === 'string' && value) {
    try {
      values = JSON.parse(value)
    }
    catch {
      return []
    }
  }
  if (!Array.isArray(values)) return []
  return values.flatMap((option) => {
    if (typeof option === 'string' || typeof option === 'number') {
      return [{
        label: String(option),
        value: String(option),
      }]
    }
    if (!option || typeof option !== 'object' || !('value' in option)) {
      return []
    }
    const record = option as Record<string, unknown>
    return [{
      label: String(record.label ?? record.value),
      value: String(record.value),
    }]
  })
}

const definitionFromRow = (row: RowDataPacket): ControlDefinition => ({
  configId: Number(row.config_id),
  name: String(row.t_name || ''),
  fieldType: String(row.f_type || ''),
  topic: String(row.topic || ''),
  publishTopic: row.publish_topic ?? null,
  payloadTemplate: row.payload_template ?? null,
  valueMap: row.value_map ?? null,
  min: row.min ?? null,
  max: row.max ?? null,
  options: parseOptions(row.options),
  oldValue: row.value ?? null,
})

const formatDateTime = (value: string | Date) => {
  if (typeof value === 'string') return value
  const pad = (part: number) => String(part).padStart(2, '0')
  return [
    `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
    `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`,
  ].join(' ')
}

const mapLog = (row: RowDataPacket): OperationLogItem => ({
  id: Number(row.id),
  operatedAt: formatDateTime(row.operate_time),
  deviceNumber: row.d_no ?? null,
  configId: row.config_id === null ? null : Number(row.config_id),
  commandName: row.direct_name ?? null,
  commandType: String(row.direct_type),
  oldValue: row.old_value ?? null,
  newValue: row.new_value ?? null,
  result: String(row.result),
  direction: String(row.remark || '').startsWith('设备端上报')
    ? 'device'
    : 'application',
  remark: row.remark ?? null,
})

const buildLogFilters = (query: OperationLogQuery) => {
  const clauses: string[] = []
  const values: Array<string> = []
  if (query.deviceNumber) {
    clauses.push('d_no = ?')
    values.push(query.deviceNumber)
  }
  if (query.commandType) {
    clauses.push('direct_type = ?')
    values.push(query.commandType)
  }
  if (query.result) {
    clauses.push('result = ?')
    values.push(query.result)
  }
  if (query.startTime) {
    clauses.push('operate_time >= ?')
    values.push(query.startTime)
  }
  if (query.endTime) {
    clauses.push('operate_time <= ?')
    values.push(query.endTime)
  }
  return {
    where: clauses.length ? clauses.join(' and ') : '1 = 1',
    values,
  }
}

export const createControlRepository = (pool: Pool): ControlRepository => ({
  async getSnapshot(deviceNumber) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `select c.id as config_id, c.ref_id, c.ref_value, c.t_name, c.f_type,
              c.min, c.max, c.topic, c.options,
              coalesce(g.value, 'off') as value
       from t_direct_config c
       left join t_direct_global g on g.config_id = c.id
       order by c.id`,
    )
    return {
      deviceNumber,
      fields: rows.map((row) => ({
        configId: Number(row.config_id),
        parentId: row.ref_id === null ? null : Number(row.ref_id),
        parentValue: row.ref_value ?? null,
        name: String(row.t_name || ''),
        type: fieldTypes[String(row.f_type)] || 'unsupported',
        min: numberOrNull(row.min),
        max: numberOrNull(row.max),
        options: parseOptions(row.options),
        topic: String(row.topic || ''),
        actionKind: isDeviceCommand(String(row.topic || ''))
          ? 'command'
          : 'parameter',
        value: row.value ?? null,
        heaterStartBlocked: false,
        automaticStartBlocked: false,
      })),
    }
  },

  async getDefinition(_deviceNumber, configId) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `select c.id as config_id, c.t_name, c.f_type, c.topic, c.publish_topic,
              c.payload_template, c.value_map, c.min, c.max, c.options,
              g.value
       from t_direct_config c
       left join t_direct_global g on g.config_id = c.id
       where c.id = ? limit 1`,
      [configId],
    )
    return rows[0] ? definitionFromRow(rows[0]) : null
  },

  async getDefinitionByTopic(topic) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `select c.id as config_id, c.t_name, c.f_type, c.topic, c.publish_topic,
              c.payload_template, c.value_map, c.min, c.max, c.options,
              g.value
       from t_direct_config c
       left join t_direct_global g on g.config_id = c.id
       where c.topic = ? limit 1`,
      [topic],
    )
    return rows[0] ? definitionFromRow(rows[0]) : null
  },

  async saveSuccess(definition, deviceNumber, value, remark) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query(
        `insert into t_direct_global (config_id, value) values (?, ?)
         on duplicate key update value = values(value)`,
        [definition.configId, value],
      )
      await connection.query(
        `insert into t_direct_history
         (direct_type, d_no, config_id, direct_name, old_value, new_value, result, remark)
         values (?, ?, ?, ?, ?, ?, 'success', ?)`,
        [
          definition.topic,
          deviceNumber,
          definition.configId,
          definition.name,
          definition.oldValue,
          value,
          remark,
        ],
      )
      await connection.commit()
    }
    catch (error) {
      await connection.rollback()
      throw error
    }
    finally {
      connection.release()
    }
  },

  async saveFailure(definition, deviceNumber, value, remark) {
    await pool.query(
      `insert into t_direct_history
       (direct_type, d_no, config_id, direct_name, old_value, new_value, result, remark)
       values (?, ?, ?, ?, ?, ?, 'failed', ?)`,
      [
        definition.topic,
        deviceNumber,
        definition.configId,
        definition.name,
        definition.oldValue,
        value,
        remark,
      ],
    )
  },

  async applyDeviceReport(deviceNumber, configId, value) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `select c.id as config_id, c.t_name, c.f_type, c.topic, c.publish_topic,
              c.payload_template, c.value_map, c.min, c.max, c.options,
              g.value
       from t_direct_config c
       left join t_direct_global g on g.config_id = c.id
       where c.id = ? limit 1`,
      [configId],
    )
    const definition = rows[0] ? definitionFromRow(rows[0]) : null
    if (!definition) throw new Error('设备上报了未知指令配置')
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query(
        `insert into t_direct_global (config_id, value) values (?, ?)
         on duplicate key update value = values(value)`,
        [configId, value],
      )
      await connection.query(
        `insert into t_direct_history
         (direct_type, d_no, config_id, direct_name, old_value, new_value, result, remark)
         values (?, ?, ?, ?, ?, ?, 'success', '设备端上报')`,
        [
          definition.topic,
          deviceNumber,
          configId,
          definition.name,
          definition.oldValue,
          value,
        ],
      )
      await connection.commit()
    }
    catch (error) {
      await connection.rollback()
      throw error
    }
    finally {
      connection.release()
    }
  },

  async saveTimeSync(deviceNumber, value, result, remark) {
    await pool.query(
      `insert into t_direct_history
       (direct_type, d_no, direct_name, new_value, result, remark)
       values ('time_sync', ?, '时间同步', ?, ?, ?)`,
      [deviceNumber, value, result, remark],
    )
  },

  async getLogOptions() {
    const [[devices], [types], [results]] = await Promise.all([
      pool.query<RowDataPacket[]>(
        `select distinct number from t_device
         where number is not null and number != ''
         order by number`,
      ),
      pool.query<RowDataPacket[]>(
        `select distinct direct_type from t_direct_history
         order by direct_type`,
      ),
      pool.query<RowDataPacket[]>(
        `select distinct result from t_direct_history
         order by result`,
      ),
    ])
    return {
      deviceNumbers: devices.map(row => String(row.number)),
      commandTypes: types.map(row => String(row.direct_type)),
      results: results.map(row => String(row.result)),
    }
  },

  async listLogs(query) {
    const { where, values } = buildLogFilters(query)
    const [counts] = await pool.query<RowDataPacket[]>(
      `select count(*) as total from t_direct_history where ${where}`,
      values,
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `select id, operate_time, direct_type, d_no, config_id, direct_name,
              old_value, new_value, result, remark
       from t_direct_history where ${where}
       order by operate_time desc, id desc limit ? offset ?`,
      [...values, query.pageSize, (query.page - 1) * query.pageSize],
    )
    return {
      items: rows.map(mapLog),
      total: Number(counts[0]?.total || 0),
    }
  },
})
