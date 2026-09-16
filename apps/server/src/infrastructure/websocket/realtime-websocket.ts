/**
 * 阅读导航：WebSocket 广播适配器：把后端已形成的实时消息推给浏览器；它不生成故障判断，也不保存历史。客户端断开连接不应影响设备控制。
 * 入口位置：infrastructure/websocket/realtime-websocket.ts
 */

import type { Server } from 'node:http'

import type { RealtimeMessage } from '@new26interthing/shared'
import { WebSocket, WebSocketServer } from 'ws'

export interface RealtimeWebSocket {
  broadcast(message: RealtimeMessage): void
  setMqttConnected(connected: boolean): void
  close(callback: () => void): void
}

/**
 * 创建基础设施模块实例，集中接收外部依赖并返回调用方使用的接口。
 * @param server 已经创建的 Node HTTP 服务器。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
export const createRealtimeWebSocket = (server: Server): RealtimeWebSocket => {
  const webSocketServer = new WebSocketServer({ server, path: '/ws' })
  let mqttConnected = false

  /**
   * 向所有已连接浏览器广播一条实时消息。
   * @param message 已经解析或准备发送的消息对象。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const broadcast = (message: RealtimeMessage) => {
    const payload = JSON.stringify(message)
    webSocketServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload)
      }
    })
  }

  webSocketServer.on('connection', (client) => {
    client.on('error', (error) => console.error('WebSocket 客户端错误:', error.message))
    client.send(JSON.stringify({ type: 'system.status', data: { mqttConnected } }))
  })

  return {
    broadcast,
    /**
     * 更新基础设施状态，并返回或广播更新后的结果。
     * @param connected MQTT 客户端当前是否连接成功。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    setMqttConnected(connected) {
      mqttConnected = connected
      broadcast({ type: 'system.status', data: { mqttConnected } })
    },
    /**
     * 按照安全顺序关闭基础设施持有的资源，并允许重复调用。
     * @param callback 资源关闭完成后需要调用的回调函数。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    close(callback) {
      webSocketServer.clients.forEach((client) => client.terminate())
      webSocketServer.close(callback)
    },
  }
}
