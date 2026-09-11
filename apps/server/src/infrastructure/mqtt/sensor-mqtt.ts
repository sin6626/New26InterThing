import mqtt from 'mqtt'

import type { AppEnv } from '../../config/env.js'

interface SensorMqttDependencies {
  env: AppEnv
  onMessage(topic: string, payload: Buffer): Promise<void>
  onConnectionChange(connected: boolean): void
}

export interface SensorMqtt {
  close(): Promise<void>
}

export const createSensorMqtt = ({
  env,
  onMessage,
  onConnectionChange,
}: SensorMqttDependencies): SensorMqtt => {
  const client = mqtt.connect(`mqtt://${env.MQTT_HOST}:${env.MQTT_PORT}`, {
    clientId: `${env.MQTT_CLIENT_ID}-new26`,
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 1_000,
    clean: true,
  })
  let connected = false

  const updateConnection = (nextConnected: boolean) => {
    if (connected === nextConnected) return
    connected = nextConnected
    onConnectionChange(connected)
  }

  client.on('connect', () => {
    updateConnection(true)
    client.subscribe('device/sensor', { qos: 0 }, (error) => {
      if (error) console.error('MQTT 订阅 device/sensor 失败:', error.message)
      else console.log('MQTT 已订阅 device/sensor')
    })
  })
  client.on('message', (topic, payload) => {
    void onMessage(topic, payload).catch((error: unknown) => {
      console.error('处理 MQTT 传感器消息失败:', error)
    })
  })
  client.on('offline', () => updateConnection(false))
  client.on('close', () => updateConnection(false))
  client.on('error', (error) => console.error('MQTT 连接错误:', error.message))

  return {
    close: () =>
      new Promise<void>((resolve) => {
        client.end(false, {}, () => resolve())
      }),
  }
}
