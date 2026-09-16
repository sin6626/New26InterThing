/**
 * 阅读导航：设备 MySQL 查询：按编号或名称筛选并分页 t_device；返回页面使用的清晰字段名而不是数据库原字段名。
 * 入口位置：modules/device/mysql.ts
 */

import type { Device, DeviceListQuery } from '@new26interthing/shared'
import type { Pool, RowDataPacket } from 'mysql2/promise'

export interface DeviceListResult {
  items: Device[]
  total: number
}

export interface DeviceRepository {
  list(query: DeviceListQuery): Promise<DeviceListResult>
}

interface DeviceRow extends RowDataPacket {
  id: number
  number: string | null
  device_name: string
  remarks: string | null
  ctime: string | null
}

interface CountRow extends RowDataPacket {
  total: number
}

/**
 * 创建设备状态模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param pool MySQL 连接池，供仓储执行参数化查询和事务。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createDeviceRepository = (pool: Pool): DeviceRepository => ({
  /**
   * 按照查询条件读取设备状态列表，并返回分页或筛选结果。
   * @param query 页面提交的筛选、分页或时间范围条件。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  async list(query) {
    const filters: string[] = []
    const filterValues: string[] = []

    if (query.number) {
      filters.push('number like ?')
      filterValues.push(`%${query.number}%`)
    }
    if (query.deviceName) {
      filters.push('device_name like ?')
      filterValues.push(`%${query.deviceName}%`)
    }

    const where = filters.length > 0 ? filters.join(' and ') : '1 = 1'
    const [countRows] = await pool.query<CountRow[]>(
      `select count(*) as total from t_device where ${where}`,
      filterValues,
    )
    const offset = (query.page - 1) * query.pageSize
    const [rows] = await pool.query<DeviceRow[]>(
      `select id, number, device_name, remarks, ctime
       from t_device
       where ${where}
       order by ctime desc, id desc
       limit ? offset ?`,
      [...filterValues, query.pageSize, offset],
    )

    return {
      total: Number(countRows[0]?.total ?? 0),
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        deviceName: row.device_name,
        remarks: row.remarks,
        createdAt: row.ctime,
      })),
    }
  },
})

