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

const formatDateTime = (timestamp: number) => {
  const date = new Date(timestamp)
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

  const getSnapshot = (deviceNumber: string): DevicePresence => {
    const record = records.get(deviceNumber)
    return {
      deviceNumber,
      status: record?.status ?? 'offline',
      lastSeenAt: record ? formatDateTime(record.lastSeen) : null,
    }
  }

  const broadcast = (deviceNumber: string) => emit({
    type: 'device.presence',
    data: getSnapshot(deviceNumber),
  })

  return {
    recordActivity(deviceNumber: string) {
      records.set(deviceNumber, {
        lastSeen: clock(),
        status: 'online',
        offlineReported: false,
      })
      broadcast(deviceNumber)
    },
    getSnapshot,
    async tick() {
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
