/**
 * 阅读导航：控制 MySQL 适配：将后台配置组成页面控制树，读写 t_direct_global，并通过操作历史模块记录动作；旧表只供旧项目使用。
 * 入口位置：modules/control/adapters/mysql.ts
 */

import type {
  Pool,
  RowDataPacket,
} from 'mysql2/promise'

import type { ControlField, ControlOption } from '@new26interthing/shared'

import type {
  ControlDefinition,
  ControlRepository,
} from '../types.js'
import { isDeviceCommand } from '../rules/policy.js'
import type { OperationHistoryRepository } from '../../operation-history/index.js'

const fieldTypes: Record<string, ControlField['type']> = {
  '1': 'switch',
  '2': 'input',
  '3': 'slider',
  '4': 'datetime',
  '5': 'radio',
  '6': 'checkbox',
}

/**
 * 把可选数据库值转换为有限数字，不存在或非法时返回空值。
 * @param value 本次准备读取、转换或保存的值。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

/**
 * 解析后台配置的可选值列表，并兼容普通字符串与 JSON 表示。
 * @param value 本次准备读取、转换或保存的值。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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

/**
 * 把控制配置查询行整理成领域定义，屏蔽数据库字段命名。
 * @param row 从 MySQL 查询得到的一行原始数据。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
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

/**
 * 控制模块的 MySQL 适配器：动态配置来自 t_direct_config，当前值来自
 * t_direct_global，所有操作结果写入新项目操作历史。
 */
export const createControlRepository = (
  pool: Pool,
  history: OperationHistoryRepository,
): ControlRepository => ({
  /**
   * 返回指定设备当前快照，供 HTTP 查询或 WebSocket 展示。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async getSnapshot(deviceNumber) {
    // 控制树的 id/ref_id/ref_value/f_type 都来自后台配置，前端据此决定
    // 父子顺序、当前模式分支和控件种类；后端不写死页面只显示文本框。
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

  /**
   * 读取指令控制需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @param _deviceNumber 设备唯一编号；当前查询按全局配置读取，因此暂不参与 SQL。
   * @param configId 后台控制配置的主键。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 读取指令控制需要的数据或状态，并转换成调用方可以直接使用的结果。
   * @param topic 控制配置使用的业务主题，例如 master、pump 或 heater。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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

  /**
   * 保存指令控制数据，并完成该写入需要的一致性处理。
   * @param definition 从数据库读取并整理后的控制项定义。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param value 本次准备读取、转换或保存的值。
   * @param _remark 兼容旧调用接口保留的说明参数；新操作历史不保存备注。
   * @param triggerMode 触发模式，用于区分人工操作和自动控制。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async saveSuccess(definition, deviceNumber, value, _remark, triggerMode = 'manual') {
    // 控制值和“成功操作日志”放在同一事务：其中一条 SQL 失败就整体回滚。
    // 注意事务不能回滚已经发出去的 MQTT，所以调用方需要区分这两种失败。
    const connection = await pool.getConnection()
    try {
      await connection.beginTransaction()
      await connection.query(
        `insert into t_direct_global (config_id, value) values (?, ?)
         on duplicate key update value = values(value)`,
        [definition.configId, value],
      )
      await history.record({
        source: 'application', triggerMode,
        commandType: definition.topic,
        deviceNumber, configId: definition.configId,
        commandName: definition.name,
        oldValue: definition.oldValue, newValue: value,
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

  /**
   * 保存指令控制数据，并完成该写入需要的一致性处理。
   * @param definition 从数据库读取并整理后的控制项定义。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param value 本次准备读取、转换或保存的值。
   * @param _remark 兼容旧调用接口保留的说明参数；新操作历史不保存备注。
   * @param triggerMode 触发模式，用于区分人工操作和自动控制。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async saveFailure(definition, deviceNumber, value, _remark, triggerMode = 'manual') {
    // 失败只记日志，不把未发布成功的新值写成当前控制值。
    await history.record({
      source: 'application', triggerMode,
      commandType: definition.topic,
      deviceNumber, configId: definition.configId,
      commandName: definition.name,
      oldValue: definition.oldValue, newValue: value,
      result: 'failed',
    })
  },

  /**
   * 执行一次指令控制业务操作，按照模块规则更新状态和外部副作用。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param configId 后台控制配置的主键。
   * @param value 本次准备读取、转换或保存的值。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
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
      await history.record({
        source: 'device', commandType: definition.topic,
        deviceNumber, configId,
        commandName: definition.name,
        oldValue: definition.oldValue, newValue: value,
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

  /**
   * 保存指令控制数据，并完成该写入需要的一致性处理。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @param value 本次准备读取、转换或保存的值。
   * @param result 本次操作或判断产生的结果。
   * @param _remark 兼容旧调用接口保留的说明参数；新操作历史不保存备注。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async saveTimeSync(deviceNumber, value, result, _remark) {
    await history.record({
      source: 'application', triggerMode: 'manual',
      commandType: 'time_sync', deviceNumber,
      commandName: '时间同步', newValue: value,
      result: result === 'success' ? 'success' : 'failed',
    })
  },
})
