/** 后端入口：创建运行时、开始监听，接收退出信号时有序停机。 */
import { createRuntime } from './runtime/create-runtime.js'

const runtime = createRuntime()
runtime.start()

process.on('SIGINT', () => void runtime.stop())
process.on('SIGTERM', () => void runtime.stop())
