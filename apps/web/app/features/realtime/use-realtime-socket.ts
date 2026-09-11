import type { RealtimeMessage, SensorRealtimeData } from '@new26interthing/shared'
import { ElNotification } from 'element-plus'

type SocketStatus = 'connecting' | 'connected' | 'disconnected'

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined

export function useRealtimeSocket() {
  const config = useRuntimeConfig()
  const socketStatus = useState<SocketStatus>('realtime-socket-status', () => 'connecting')
  const mqttConnected = useState('realtime-mqtt-connected', () => false)
  const readings = useState<Record<string, SensorRealtimeData>>('realtime-readings', () => ({}))

  const connect = () => {
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
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
        if (message.type === 'fault.alert') {
          ElNotification.error({
            title: `设备 ${message.data.deviceNumber || '未知'} 发生故障`,
            message: message.data.message || `故障编号 ${message.data.errorNumber || '未知'}`,
            duration: 8_000,
            position: 'top-right',
          })
        }
      }
      catch (error) {
        console.warn('无法解析实时消息', error)
      }
    })
    socket.addEventListener('close', () => {
      socketStatus.value = 'disconnected'
      mqttConnected.value = false
      reconnectTimer = setTimeout(connect, 2000)
    })
    socket.addEventListener('error', () => socket?.close())
  }

  onMounted(connect)

  return { mqttConnected, readings, socketStatus }
}
