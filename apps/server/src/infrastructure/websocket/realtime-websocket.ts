import type { Server } from 'node:http'

import type { RealtimeMessage } from '@new26interthing/shared'
import { WebSocket, WebSocketServer } from 'ws'

export interface RealtimeWebSocket {
  broadcast(message: RealtimeMessage): void
  setMqttConnected(connected: boolean): void
  close(callback: () => void): void
}

export const createRealtimeWebSocket = (server: Server): RealtimeWebSocket => {
  const webSocketServer = new WebSocketServer({ server, path: '/ws' })
  let mqttConnected = false

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
    setMqttConnected(connected) {
      mqttConnected = connected
      broadcast({ type: 'system.status', data: { mqttConnected } })
    },
    close(callback) {
      webSocketServer.clients.forEach((client) => client.terminate())
      webSocketServer.close(callback)
    },
  }
}
