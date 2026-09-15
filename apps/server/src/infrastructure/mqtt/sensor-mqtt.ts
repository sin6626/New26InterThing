/**
 * 阅读导航：MQTT 传输适配器：负责连接 Broker、订阅设备主题和发布 JSON；不判断泵或加热是否安全。publish 回调仅证明 Broker 接收，不证明设备执行。
 * 入口位置：infrastructure/mqtt/sensor-mqtt.ts
 */

import mqtt from 'mqtt'

import type { AppEnv } from '../../config/env.js'

/**
 * MQTT 基础设施适配器：只管理连接、订阅与 QoS 发布。
 * Topic 的业务分流和报文解析统一由后端组合根处理。
 */

interface SensorMqttDependencies {
  env: AppEnv
  onMessage(topic: string, payload: Buffer): Promise<void>
  onConnectionChange(connected: boolean): void
}

export interface SensorMqtt {
  publish(topic: string, payload: Record<string, unknown>): Promise<void>
  close(): Promise<void>
}
export const createSensorMqtt = ({
  env,
  onMessage,
  onConnectionChange,
}: SensorMqttDependencies): SensorMqtt => {
  // 创建mqttClint
  const client = mqtt.connect(`mqtt://${env.MQTT_HOST}:${env.MQTT_PORT}`, {
    clientId: `${env.MQTT_CLIENT_ID}-new26`,
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    reconnectPeriod: 1_000,
    clean: true,
  })
  let connected = false
  // 自己发布的 device/direct 消息可能因订阅同主题又被本进程收到。
  // 这张短期指纹表用于过滤“自己发给自己的回声”，不能当设备执行确认。
  const outboundFingerprints = new Map<string, number>()

  const fingerprint = (topic: string, payload: string) => `${topic}\n${payload}`

  const updateConnection = (nextConnected: boolean) => {
    if (connected === nextConnected) return
    connected = nextConnected
    onConnectionChange(connected)
  }

  client.on('connect', () => {
    // device/sensor 是传感器上行；device/direct 是设备指令回报。
    // 出站设备控制 topic 可由数据库配置，不在这里硬编码订阅为传感器消息。
    updateConnection(true)
    client.subscribe(['device/sensor', 'device/direct'], { qos: 0 }, (error) => {
      if (error) console.error('MQTT 订阅失败:', error.message)
      else console.log('MQTT 已订阅 device/sensor、device/direct')
    })
  })
  client.on('message', (topic, payload) => {
    const key = fingerprint(topic, payload.toString('utf8'))
    const expiresAt = outboundFingerprints.get(key)
    if (expiresAt && expiresAt > Date.now()) {
      outboundFingerprints.delete(key)
      return
    }
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
    publish(topic, payload) {
      return new Promise<void>((resolve, reject) => {
        if (!connected) {
          reject(new Error('MQTT 当前未连接'))
          return
        }
        const payloadText = JSON.stringify(payload)
        const key = fingerprint(topic, payloadText)
        if (topic === 'device/direct') {
          const expiresAt = Date.now() + 5_000
          outboundFingerprints.set(key, expiresAt)
          setTimeout(() => {
            if (outboundFingerprints.get(key) === expiresAt) {
              outboundFingerprints.delete(key)
            }
          }, 5_000).unref()
        }
        let settled = false
        const finish = (error?: Error) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          if (error) {
            outboundFingerprints.delete(key)
            reject(error)
          }
          else {
            resolve()
          }
        }
        const timer = setTimeout(
          // Broker 卡住时不能让 HTTP 指令请求无限等待。
          () => finish(new Error('MQTT 发布超时')),
          2_000,
        )
        client.publish(topic, payloadText, { qos: 1, retain: false }, (error) => {
          // QoS 1 的回调只说明发布链路得到 Broker 确认；设备实际开关仍看上行反馈。
          finish(error || undefined)
        })
      })
    },
    close: () =>
      new Promise<void>((resolve) => {
        client.end(false, {}, () => resolve())
      }),
  }
}
