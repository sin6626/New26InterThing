/**
 * 阅读导航：设备在线状态：online=0 实时包刷新最后活跃时间，超过后台离线阈值判离线并上报 E002；online=1 补发包不能让设备假在线。
 * 入口位置：modules/device/presence.ts
 * 现在架构有问题, 主要是main里面在跑定时器去检测是否, 不确定是不是在main里面调用这个, 还是得改架构
 */

import type {
  DevicePresence,
  DevicePresenceMessage,
} from '@new26interthing/shared'

interface Dependencies {
  clock?: () => number
  loadOfflineTimeoutSeconds(): Promise<number>
  emit(message: DevicePresenceMessage): void
  reportOffline(deviceNumber: string, detail: string): Promise<void>
}

interface PresenceRecord {
  lastSeen: number
  status: DevicePresence['status']
  offlineReported: boolean
}

/**
 * 把时间值转换成数据库和页面统一使用的本地日期时间字符串。
 * @param timestamp 需要转换或比较的时间戳，单位为毫秒。
 * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
 */
const formatDateTime = (timestamp: number) => {
  const date = new Date(timestamp)
  /**
   * 把单个时间数字补齐为两位字符串，供日期时间格式化复用。
   * @param value 本次准备读取、转换或保存的值。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 只用实时传感器活跃时间判断在线；补发数据不会刷新在线状态。 */
export const createDevicePresenceService = ({
  clock = Date.now,
  loadOfflineTimeoutSeconds,
  emit,
  reportOffline,
}: Dependencies) => {
  const records = new Map<string, PresenceRecord>()

  /**
   * 返回指定设备当前快照，供 HTTP 查询或 WebSocket 展示。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const getSnapshot = (deviceNumber: string): DevicePresence => {
    const record = records.get(deviceNumber)
    return {
      deviceNumber,
      status: record?.status ?? 'offline',
      lastSeenAt: record ? formatDateTime(record.lastSeen) : null,
    }
  }

  /**
   * 向所有已连接浏览器广播一条实时消息。
   * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
   * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
   */
  const broadcast = (deviceNumber: string) => emit({
    type: 'device.presence',
    data: getSnapshot(deviceNumber),
  })

  return {
    /**
     * 保存设备状态数据，并完成该写入需要的一致性处理。
     * @param deviceNumber 设备唯一编号，对应数据库和 MQTT 报文中的 d_no。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    recordActivity(deviceNumber: string) {
      // 这里只由实时包调用；收到补发包不能重置 lastSeen，否则掉线设备会假在线。
      records.set(deviceNumber, {
        lastSeen: clock(),
        status: 'online',
        offlineReported: false,
      })
      broadcast(deviceNumber)
    },
    getSnapshot,
    /**
     * 由定时器周期调用，在没有新报文时继续推进设备状态超时和时间规则。
     * @returns 函数签名中声明的结果；异步函数失败时会抛出异常。
     */
    async tick() {
      // 不依赖设备主动说“我离线”；由服务器时钟与最后收到实时包的时间比较。
      const timeoutSeconds = await loadOfflineTimeoutSeconds()
      if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
        throw new Error('设备离线超时时间必须大于 0')
      }
      const now = clock()
      for (const [deviceNumber, record] of records) {
        if (now - record.lastSeen <= timeoutSeconds * 1_000) continue
        if (record.status === 'online') {
          record.status = 'offline'
          broadcast(deviceNumber)
        }
        if (!record.offlineReported) {
          // 同一段离线期间只报告一次 E002；下一次实时包会重置这一标记。
          await reportOffline(
            deviceNumber,
            `超过 ${timeoutSeconds} 秒未收到设备实时数据`,
          )
          record.offlineReported = true
        }
      }
    },
  }
}

export type DevicePresenceService = ReturnType<typeof createDevicePresenceService>
