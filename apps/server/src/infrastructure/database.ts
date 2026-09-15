/**
 * 阅读导航：MySQL 连接池工厂：用已校验的配置建立数据库连接；实际 SQL 放在各模块的 mysql 适配器中。连接池会被多个模块共用。
 * 入口位置：infrastructure/database.ts
 */

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

