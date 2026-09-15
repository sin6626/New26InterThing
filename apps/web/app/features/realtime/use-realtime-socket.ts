import type {
  AutomationSnapshot,
  DevicePresence,
  HydraulicDiagnosis,
  OperationalMetricsSnapshot,
  RealtimeMessage,
  SensorRealtimeData,
  WaterFlowSnapshot,
} from '@new26interthing/shared'
import { ElNotification } from 'element-plus'

import {
  appendRealtimePoint,
  appendRealtimeSecondPoint,
  type RealtimeTrendPoint,
} from './realtime-trend'

type SocketStatus = 'connecting' | 'connected' | 'disconnected'

let socket: WebSocket | undefined
let reconnectTimer: ReturnType<typeof setTimeout> | undefined

export function useRealtimeSocket() {
  /**
   * 前端唯一的 WebSocket 消息分发入口。
   * 按消息 type 更新共享响应式状态，页面组件只负责展示，不参与后端控制决策。
   */
  const config = useRuntimeConfig()
  const socketStatus = useState<SocketStatus>('realtime-socket-status', () => 'connecting')
  const mqttConnected = useState('realtime-mqtt-connected', () => false)
  const readings = useState<Record<string, SensorRealtimeData>>('realtime-readings', () => ({}))
  const devicePresence = useState<Record<string, DevicePresence>>(
    'device-presence',
    () => ({}),
  )
  const hydraulicDiagnoses = useState<Record<string, HydraulicDiagnosis>>(
    'hydraulic-diagnoses',
    () => ({}),
  )
  const automationSnapshots = useState<Record<string, AutomationSnapshot>>(
    'automation-snapshots',
    () => ({}),
  )
  const waterFlowSnapshots = useState<Record<string, WaterFlowSnapshot>>(
    'water-flow-snapshots',
    () => ({}),
  )
  const operationalMetricsSnapshots = useState<Record<string, OperationalMetricsSnapshot>>(
    'operational-metrics-snapshots',
    () => ({}),
  )
  const trendPoints = useState<Record<string, RealtimeTrendPoint[]>>(
    'realtime-trend-points',
    () => ({}),
  )
  const realtimeDetailPoints = useState<Record<string, RealtimeTrendPoint[]>>(
    'realtime-detail-points',
    () => ({}),
  )
  const connectionGeneration = useState(
    'realtime-connection-generation',
    () => 0,
  )

  const connect = () => {
    if (socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return
    socketStatus.value = 'connecting'
    socket = new WebSocket(config.public.wsUrl)

    socket.addEventListener('open', () => {
      socketStatus.value = 'connected'
      connectionGeneration.value += 1
    })
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as RealtimeMessage
        if (message.type === 'system.status') {
          mqttConnected.value = message.data.mqttConnected
        }
        if (message.type === 'sensor.realtime') {
          readings.value = { ...readings.value, [message.data.deviceNumber]: message.data }
          trendPoints.value = {
            ...trendPoints.value,
            [message.data.deviceNumber]: appendRealtimePoint(
              trendPoints.value[message.data.deviceNumber] || [],
              message.data,
            ),
          }
          realtimeDetailPoints.value = {
            ...realtimeDetailPoints.value,
            [message.data.deviceNumber]: appendRealtimeSecondPoint(
              realtimeDetailPoints.value[message.data.deviceNumber] || [],
              message.data,
            ),
          }
        }
        if (message.type === 'device.presence') {
          devicePresence.value = {
            ...devicePresence.value,
            [message.data.deviceNumber]: message.data,
          }
        }
        if (message.type === 'hydraulic.diagnosis') {
          hydraulicDiagnoses.value = {
            ...hydraulicDiagnoses.value,
            [message.data.deviceNumber]: message.data,
          }
        }
        if (message.type === 'automation.status') {
          automationSnapshots.value = {
            ...automationSnapshots.value,
            [message.data.deviceNumber]: message.data,
          }
        }
        if (message.type === 'water-flow.realtime') {
          waterFlowSnapshots.value = {
            ...waterFlowSnapshots.value,
            [message.data.deviceNumber]: message.data,
          }
        }
        if (message.type === 'operational-metrics.realtime') {
          operationalMetricsSnapshots.value = {
            ...operationalMetricsSnapshots.value,
            [message.data.deviceNumber]: message.data,
          }
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

  return {
    automationSnapshots,
    connectionGeneration,
    devicePresence,
    hydraulicDiagnoses,
    mqttConnected,
    operationalMetricsSnapshots,
    readings,
    realtimeDetailPoints,
    socketStatus,
    trendPoints,
    waterFlowSnapshots,
  }
}
