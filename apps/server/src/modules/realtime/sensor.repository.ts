import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise'

import type { ParsedSensorMessage } from './sensor-message.js'
import type { SensorRealtimeData } from '@new26interthing/shared'

interface SensorFieldMapping extends RowDataPacket {
  f_name: string
  db_name: string
  p_name: string
  visible: string | null
}

export interface SensorRepository {
  save(message: ParsedSensorMessage): Promise<SensorRealtimeData>
}

const sensorColumns = new Set(Array.from({ length: 10 }, (_, index) => `field${index + 1}`))

export const createSensorRepository = (pool: Pool): SensorRepository => ({
  async save(message) {
    const [mappingRows] = await pool.query<SensorFieldMapping[]>(
      `select f_name, db_name, p_name, visible
       from t_sensor_field_mapper
       order by db_name`,
    )
    const mappings = mappingRows.filter((mapping) => sensorColumns.has(mapping.db_name))
    if (mappings.length === 0) {
      throw new Error('传感器字段映射表为空或包含无效列')
    }
    if (!mappings.some((mapping) => Object.hasOwn(message.values, mapping.p_name))) {
      throw new Error('没有可映射的传感器字段')
    }

    const columns = ['d_no', ...mappings.map((mapping) => mapping.db_name), 'c_time', 'online', 'vstatus']
    const values = [
      message.deviceNumber,
      ...mappings.map((mapping) => message.values[mapping.p_name] ?? null),
      message.recordedAt,
      '实时数据',
      0,
    ]
    const placeholders = columns.map(() => '?').join(', ')
    const [result] = await pool.query<ResultSetHeader>(
      `insert into t_sensor_data (${columns.join(', ')}) values (${placeholders})`,
      values,
    )
    if (result.affectedRows !== 1) {
      throw new Error('传感器数据写入失败')
    }

    const visibleMappings = mappings.filter((mapping) => mapping.visible !== '0')
    return {
      deviceNumber: message.deviceNumber,
      recordedAt: message.recordedAt,
      fields: Object.fromEntries(
        visibleMappings.map((mapping) => [
          mapping.f_name,
          message.values[mapping.p_name] ?? null,
        ]),
      ),
    }
  },
})
