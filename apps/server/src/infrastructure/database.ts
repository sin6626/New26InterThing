import mysql from 'mysql2/promise'

import type { AppEnv } from '../config/env.js'

export const createDatabasePool = (env: AppEnv) =>
  mysql.createPool({
    host: env.DB_HOST,
    port: env.DB_PORT,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    connectionLimit: 10,
    dateStrings: true,
  })

