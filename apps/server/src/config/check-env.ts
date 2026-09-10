import { ZodError } from 'zod'

import { readEnv } from './env.js'

try {
  readEnv()
  console.log('环境配置检查通过')
} catch (error) {
  if (error instanceof ZodError) {
    console.error('环境配置不完整：')
    error.issues.forEach((issue) => console.error(`- ${issue.path.join('.')}: ${issue.message}`))
  } else {
    console.error(error)
  }
  process.exitCode = 1
}

