/** 水泵、加热实时运行时长的 MySQL 持久化适配器。 */
import type { Pool, RowDataPacket } from 'mysql2/promise'

import type { OperationHistoryRepository } from '../operation-history/index.js'
import type {
  OperationalMetricsRepository,
  OperationalSwitchState,
} from './types.js'

const switchState = (value: unknown): OperationalSwitchState => (
  value === 'on' || value === 'off' ? value : 'unknown'
)

export const createOperationalMetricsRepository = (
  pool: Pool,
  history: OperationHistoryRepository,
): OperationalMetricsRepository => ({
  async load(deviceNumber) {
    const [rows] = await pool.query<RowDataPacket[]>(
      `select pump_runtime_seconds, heater_runtime_seconds, last_calc_time,
              last_pump_state, last_heater_state
       from t_operational_metrics_accumulator
       where d_no = ? limit 1`,
      [deviceNumber],
    )
    if (!rows[0]) return null
    return {
      pumpRuntimeSeconds: Number(rows[0].pump_runtime_seconds) || 0,
      heaterRuntimeSeconds: Number(rows[0].heater_runtime_seconds) || 0,
      lastCalculatedAt: Number(rows[0].last_calc_time) || 0,
      lastPumpState: switchState(rows[0].last_pump_state),
      lastHeaterState: switchState(rows[0].last_heater_state),
    }
  },

  async save(deviceNumber, state) {
    await pool.query(
      `insert into t_operational_metrics_accumulator
       (d_no, pump_runtime_seconds, heater_runtime_seconds, last_calc_time,
        last_pump_state, last_heater_state)
       values (?, ?, ?, ?, ?, ?)
       on duplicate key update
         pump_runtime_seconds = values(pump_runtime_seconds),
         heater_runtime_seconds = values(heater_runtime_seconds),
         last_calc_time = values(last_calc_time),
         last_pump_state = values(last_pump_state),
         last_heater_state = values(last_heater_state)`,
      [
        deviceNumber,
        state.pumpRuntimeSeconds,
        state.heaterRuntimeSeconds,
        state.lastCalculatedAt,
        state.lastPumpState,
        state.lastHeaterState,
      ],
    )
  },

  async reset(deviceNumber, oldPumpRuntimeSeconds, oldHeaterRuntimeSeconds) {
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query(
        `insert into t_operational_metrics_accumulator
         (d_no, pump_runtime_seconds, heater_runtime_seconds, last_calc_time,
          last_pump_state, last_heater_state)
         values (?, 0, 0, 0, 'unknown', 'unknown')
         on duplicate key update
           pump_runtime_seconds = 0,
           heater_runtime_seconds = 0,
           last_calc_time = 0,
           last_pump_state = 'unknown',
           last_heater_state = 'unknown'`,
        [deviceNumber],
      )
      await history.record({
        source: 'application',
        triggerMode: 'manual',
        commandType: 'reset_operational_runtime',
        deviceNumber,
        commandName: '清零泵与加热运行时长',
        oldValue: `水泵${oldPumpRuntimeSeconds}秒；加热${oldHeaterRuntimeSeconds}秒`,
        newValue: '水泵0秒；加热0秒',
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
