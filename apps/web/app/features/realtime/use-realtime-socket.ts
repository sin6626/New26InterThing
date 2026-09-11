import type { RealtimeMessage, SensorRealtimeData } from '@new26interthing/shared'

type SocketStatus = 'connecting' | 'connected' | 'disconnected'

export function useRealtimeSocket() {
  const config = useRuntimeConfig()
  const socketStatus = ref<SocketStatus>('connecting')
  const mqttConnected = ref(false)
  const readings = ref<Record<string, SensorRealtimeData>>({})
  let socket: WebSocket | undefined
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const connect = () => {
    socketStatus.value = 'connecting'
    socket = new WebSocket(config.public.wsUrl)

    socket.addEventListener('open', () => {
      socketStatus.value = 'connected'
    })
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as RealtimeMessage
        if (message.type === 'system.status') {
          mqttConnected.value = message.data.mqttConnected
        }
        if (message.type === 'sensor.realtime') {
          readings.value = { ...readings.value, [message.data.deviceNumber]: message.data }
        }
      }
      catch (error) {
        console.warn('无法解析实时消息', error)
      }
    })
    socket.addEventListener('close', () => {
      socketStatus.value = 'disconnected'
      mqttConnected.value = false
      if (!stopped) {
        reconnectTimer = setTimeout(connect, 2000)
      }
    })
    socket.addEventListener('error', () => socket?.close())
  }

  onMounted(connect)
  onBeforeUnmount(() => {
    stopped = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
  })

  return { mqttConnected, readings, socketStatus }
}
