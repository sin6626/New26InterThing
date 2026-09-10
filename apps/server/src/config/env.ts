import path from 'node:path'
import { fileURLToPath } from 'node:url'

import dotenv from 'dotenv'
import { z } from 'zod'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(serverDirectory, '../../../../.env') })

const envSchema = z.object({
  SERVER_HOST: z.string().default('127.0.0.1'),
  SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_ORIGIN: z.string().default('http://localhost:5174'),
  DB_HOST: z.string().min(1, 'DB_HOST 不能为空'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_USER: z.string().min(1, 'DB_USER 不能为空'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1, 'DB_NAME 不能为空'),
})

export type AppEnv = z.infer<typeof envSchema>

export const readEnv = (): AppEnv => envSchema.parse(process.env)
