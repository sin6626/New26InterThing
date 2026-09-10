import { createApp } from './app.js'
import { readEnv } from './config/env.js'
import { createDatabasePool } from './infrastructure/database.js'
import { createDeviceRepository } from './modules/device/device.repository.js'

const env = readEnv()
const pool = createDatabasePool(env)
const app = createApp({
  deviceRepository: createDeviceRepository(pool),
})

const server = app.listen(env.SERVER_PORT, env.SERVER_HOST, () => {
  console.log(`后端已启动：http://${env.SERVER_HOST}:${env.SERVER_PORT}`)
})

const stop = () => {
  server.close(() => {
    void pool.end().finally(() => process.exit(0))
  })
}

process.on('SIGINT', stop)
process.on('SIGTERM', stop)
