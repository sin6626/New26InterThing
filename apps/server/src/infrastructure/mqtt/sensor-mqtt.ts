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

const topics = ['device/sensor', 'device/error'] as const

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
    client.subscribe([...topics], { qos: 0 }, (error) => {
      if (error) console.error('MQTT 订阅失败:', error.message)
      else console.log(`MQTT 已订阅 ${topics.join('、')}`)
    })
  })
  client.on('message', (topic, payload) => {
    void onMessage(topic, payload).catch((error: unknown) => {
      console.error(`处理 MQTT 消息 ${topic} 失败:`, error)
    })
  })
  client.on('offline', () => updateConnection(false))
  client.on('close', () => updateConnection(false))
  client.on('error', (error) => console.error('MQTT 连接错误:', error.message))

  // 把MQTT的close方法自己做一层封装, 返回更加现在的Promise, 原本是回调函数的写法, 很容易回调地狱
  // 第 1 个参数 false（是否强制断开）：设置为 false 表示优雅关闭（Graceful Shutdown）：如果当前还有正在排队发送的消息，等它发完再断开，而不是粗暴地瞬间切断 TCP 网络连接。第 2 个参数 {}（可选配置参数）：传空对象，使用默认配置即可。第 3 个参数 () => resolve()（完成回调函数）：当底层网络连接真正断开、所有清理工作完全结束时，mqtt.js 才会调用这个回调函数。在这里调用 resolve()，将 Promise 标记为完成。
  return {
    close: () =>
      new Promise<void>((resolve) => {
        client.end(false, {}, () => resolve())
      }),
  }
}
