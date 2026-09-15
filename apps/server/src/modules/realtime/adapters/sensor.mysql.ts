/**
 * 阅读导航：传感器历史入库：依 t_sensor_field_mapper 将上行字段写进 field1~field10，再返回页面动态字段；所有数据先保存历史。
 * 入口位置：modules/realtime/adapters/sensor.mysql.ts
 */

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

export type EvaluateSensorVstatus = (message: ParsedSensorMessage) => Promise<number>

const sensorColumns = new Set(Array.from({ length: 10 }, (_, index) => `field${index + 1}`))

/** 按字段映射把设备 JSON 写入 field1~field10，并返回前端可读的动态字段。 */
export const createSensorRepository = (
  pool: Pool,
  evaluateVstatus: EvaluateSensorVstatus,
): SensorRepository => ({
  async save(message) {
    // 传感器 p_name 是设备报文字段，db_name 是历史表列名：
    // 例如 temp_out → field2。SQL 列名不能用参数占位符，必须先经过列白名单。
    const vstatus = await evaluateVstatus(message)
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
      // 缺失的某个传感器字段写 null，而不是沿用上次读数伪造一条完整记录。
      message.deviceNumber,
      ...mappings.map((mapping) => message.values[mapping.p_name] ?? null),
      message.recordedAt,
      message.dataKind === 'backfill' ? '1' : '0',
      vstatus,
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
      dataKind: message.dataKind,
      fields: Object.fromEntries(
        visibleMappings.map((mapping) => [
          mapping.p_name,
          message.values[mapping.p_name] ?? null,
        ]),
      ),
    }
  },
})
