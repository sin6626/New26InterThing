/** 现场首次部署时执行一次；只创建新表，不碰旧表或已有记录。 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RowDataPacket } from 'mysql2/promise'
import { readEnv } from './env.js'
import { createDatabasePool } from '../infrastructure/database.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const sqlPath = path.resolve(directory, '../../migrations/001-operation-history.sql')
const pool = createDatabasePool(readEnv())

try {
  const sql = await fs.readFile(sqlPath, 'utf8')
  await pool.query(sql)
  const [rows] = await pool.query<RowDataPacket[]>(
    'select count(*) as total from t_operation_history',
  )
  console.log('新项目操作历史表已就绪；当前记录数：', Number(rows[0]?.total ?? 0))
}
finally {
  await pool.end()
}
