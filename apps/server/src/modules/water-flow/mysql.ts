/**
 * 阅读导航：累计水量 MySQL 适配：载入、保存、清零水量和读取后台管径配置；公式不应放在 SQL 适配中。
 * 入口位置：modules/water-flow/mysql.ts
 */

import type {
  Pool,
  RowDataPacket,
} from 'mysql2/promise'

import type { WaterFlowRepository } from './types.js'

export const createWaterFlowRepository = (
  pool: Pool,
): WaterFlowRepository => ({
  async load(deviceNumber) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `select total_volume, last_flow_rate, last_calc_time
       from t_water_flow_accumulator where d_no = ? limit 1`,
      [deviceNumber],
    )
    if (!rows[0]) return null
    return {
      totalVolumeLiters: Number(rows[0].total_volume) || 0,
      lastFlowRateLitersPerMinute: Number(rows[0].last_flow_rate) || 0,
      lastCalculatedAt: Number(rows[0].last_calc_time) || 0,
    }
  },

  async save(deviceNumber, state) {
    await pool.query(
      `insert into t_water_flow_accumulator
       (d_no, total_volume, last_flow_rate, last_calc_time)
       values (?, ?, ?, ?)
       on duplicate key update
         total_volume = values(total_volume),
         last_flow_rate = values(last_flow_rate),
         last_calc_time = values(last_calc_time)`,
      [
        deviceNumber,
        state.totalVolumeLiters,
        state.lastFlowRateLitersPerMinute,
        state.lastCalculatedAt,
      ],
    )
  },

  async reset(deviceNumber, oldVolumeLiters) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query(
        `insert into t_water_flow_accumulator
         (d_no, total_volume, last_flow_rate, last_calc_time)
         values (?, 0, 0, 0)
         on duplicate key update total_volume = 0`,
        [deviceNumber],
      )
      await connection.query(
        `insert into t_direct_history
         (direct_type, d_no, direct_name, old_value, new_value, result, remark)
         values ('reset_total_volume', ?, '清零累计水量', ?, '0', 'success', '用户操作清零')`,
        [deviceNumber, String(oldVolumeLiters)],
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
})

export const createPipeDiameterLoader = (pool: Pool) => async () => {
  const [rows] = await pool.query<RowDataPacket[]>(
    `select g.value
     from t_direct_config c
     join t_direct_global g on g.config_id = c.id
     where c.topic = 'pipe_inner_diameter' limit 1`,
  )
  const value = Number(rows[0]?.value)
  return Number.isFinite(value) && value > 0 ? value : null
}
