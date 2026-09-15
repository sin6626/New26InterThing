/**
 * 阅读导航：启动前环境检查：验证必需环境变量是否齐全；不处理业务请求。环境不合法时应在启动阶段暴露问题。
 * 入口位置：config/check-env.ts
 */

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

