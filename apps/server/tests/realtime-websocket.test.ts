import { createServer } from 'node:http'

import WebSocket from 'ws'
import { afterEach, describe, expect, it } from 'vitest'

import { createRealtimeWebSocket } from '../src/infrastructure/websocket/realtime-websocket.js'

const cleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

const createConnectedPair = async () => {
  const server = createServer()
  const realtime = createRealtimeWebSocket(server)
  server.listen(0, '127.0.0.1')
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
  const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
  await new Promise<void>((resolve, reject) => {
    client.once('open', resolve)
    client.once('error', reject)
  })
  cleanups.push(
    () =>
      new Promise((resolve) => {
        client.close()
        realtime.close(() => server.close(() => resolve()))
      }),
  )
  return { client, realtime }
}

describe('realtime WebSocket', () => {
  it('sends the current MQTT connection status to a newly connected client', async () => {
    const server = createServer()
    const realtime = createRealtimeWebSocket(server)
    realtime.setMqttConnected(true)
    server.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('测试服务启动失败')
    const client = new WebSocket(`ws://127.0.0.1:${address.port}/ws`)
    const received = new Promise<string>((resolve) =>
      client.once('message', (data) => resolve(data.toString())),
    )
    cleanups.push(
      () =>
        new Promise((resolve) => {
          client.close()
          realtime.close(() => server.close(() => resolve()))
        }),
    )

    await expect(received).resolves.toBe(
      JSON.stringify({ type: 'system.status', data: { mqttConnected: true } }),
    )
  })

  it('broadcasts sensor realtime messages to a connected browser client', async () => {
    const { client, realtime } = await createConnectedPair()
    const message = {
      type: 'sensor.realtime' as const,
      data: {
        deviceNumber: '202111',
        recordedAt: '2026-09-11 09:30:00',
        fields: { 出水温度: 28.7 },
      },
    }
    const received = new Promise<string>((resolve) =>
      client.once('message', (data) => resolve(data.toString())),
    )

    realtime.broadcast(message)

    await expect(received).resolves.toBe(JSON.stringify(message))
  })

  it('broadcasts fault alerts to a connected browser client', async () => {
    const { client, realtime } = await createConnectedPair()
    const message = {
      type: 'fault.alert' as const,
      data: {
        id: 88,
        deviceNumber: '202111',
        errorNumber: 'E001',
        type: '3',
        message: '传感器故障',
        occurredAt: '2026-09-11 10:00:00',
      },
    }
    const received = new Promise<string>((resolve) =>
      client.once('message', (data) => resolve(data.toString())),
    )

    realtime.broadcast(message)

    await expect(received).resolves.toBe(JSON.stringify(message))
  })

  it('ignores closed clients when broadcasting', async () => {
    const server = createServer()
    const realtime = createRealtimeWebSocket(server)
    server.listen(0, '127.0.0.1')
    await new Promise<void>((resolve) => server.once('listening', resolve))
    cleanups.push(
      () =>
        new Promise((resolve) => {
          realtime.close(() => server.close(() => resolve()))
        }),
    )

    expect(() =>
      realtime.broadcast({
        type: 'sensor.realtime',
        data: { deviceNumber: '202111', recordedAt: '2026-09-11 09:30:00', fields: {} },
      }),
    ).not.toThrow()
  })
})
