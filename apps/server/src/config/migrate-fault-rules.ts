import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readEnv } from './env.js'
import { createDatabasePool } from '../infrastructure/database.js'

const directory = path.dirname(fileURLToPath(import.meta.url))
const pool = createDatabasePool(readEnv())
try {
  const sql = await fs.readFile(path.resolve(directory, '../../migrations/004-fault-rule-config.sql'), 'utf8')
  const statements = sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(item => item.trim())
    .filter(Boolean)
  for (const statement of statements) {
    await pool.query(statement)
  }
  console.log('告警规则配置表已就绪')
}
finally {
  await pool.end()
}
