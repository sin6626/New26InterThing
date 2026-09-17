/** 现场首次部署时执行一次；只创建实时运行时长累计表。 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RowDataPacket } from 'mysql2/promise'

import { readEnv } from './env.js'
import { createDatabasePool } from '../infrastructure/database.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const sqlPath = path.resolve(
  directory,
  '../../migrations/003-operational-metrics-accumulator.sql',
)
const pool = createDatabasePool(readEnv())

try {
  await pool.query(await fs.readFile(sqlPath, 'utf8'))
  const [rows] = await pool.query<RowDataPacket[]>(
    'select count(*) as total from t_operational_metrics_accumulator',
  )
  console.log('实时运行时长累计表已就绪；当前记录数：', Number(rows[0]?.total ?? 0))
}
finally {
  await pool.end()
}
