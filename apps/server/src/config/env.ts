/**
 * 阅读导航：环境变量入口：从项目 .env 读取并用 Zod 校验；AppEnv 是校验后配置的 TypeScript 类型。不要在业务文件里重复解析环境变量。
 * 入口位置：config/env.ts
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { z } from 'zod'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(serverDirectory, '../../../../.env') })

const envSchema = z.object({
  SERVER_HOST: z.string().default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DB_HOST: z.string().min(1, 'DB_HOST 不能为空'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1, 'DB_USER 不能为空'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1, 'DB_NAME 不能为空'),
  MQTT_HOST: z.string().min(1, 'MQTT_HOST 不能为空').default('127.0.0.1'),
  MQTT_PORT: z.coerce.number().int().min(1).max(65535).default(1883),
  MQTT_CLIENT_ID: z.string().min(1).default('new26interthing'),
  MQTT_USERNAME: z.string().default(''),
  MQTT_PASSWORD: z.string().default(''),
})

// infer: 暗示, 也就是让zod通过envSchema反推类型
export type AppEnv = z.infer<typeof envSchema>

// 一般配置做校验使用parse, parse如果校验错误了, 会直接抛出ZodError的异常, 然后直接让服务停止
/**
 * 读取进程环境变量并通过 Zod 完整校验；配置缺失时直接阻止后端启动。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const readEnv = (): AppEnv => envSchema.parse(process.env)
