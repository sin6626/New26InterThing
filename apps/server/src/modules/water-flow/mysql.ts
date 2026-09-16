/**
 * 阅读导航：累计水量 MySQL 适配：载入、保存、清零水量和读取后台管径配置；公式不应放在 SQL 适配中。
 * 入口位置：modules/water-flow/mysql.ts
 */

import type {
  Pool,
  RowDataPacket,
} from 'mysql2/promise'

import type { WaterFlowRepository } from './types.js'
import type { OperationHistoryRepository } from '../operation-history/index.js'

/**
 * 创建水循环累计模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @param history 操作历史仓储，用于记录本次动作的来源和结果。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createWaterFlowRepository = (
  pool: Pool,
  history: OperationHistoryRepository,
): WaterFlowRepository => ({
  /**
   * 从数据库读取设备已持久化的累计水量和最后计算时间。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 保存水循环累计数据，并完成该写入需要的一致性处理。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param state 当前设备或状态机的内部状态。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 重置水循环累计当前状态；只清理本函数负责的数据，不会隐式启动设备。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param oldVolumeLiters 清零前的累计水量，用于写入操作历史原值。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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
      await history.record({
        source: 'application', triggerMode: 'manual',
        commandType: 'reset_total_volume', deviceNumber,
        commandName: '清零累计水量',
        oldValue: String(oldVolumeLiters), newValue: '0',
        result: 'success',
      }, connection)
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

/**
 * 创建水循环累计模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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
