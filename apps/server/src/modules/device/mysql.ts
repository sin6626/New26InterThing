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

export const createDeviceRepository = (pool: Pool): DeviceRepository => ({
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

