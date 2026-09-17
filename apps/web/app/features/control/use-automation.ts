import type { AutomationSnapshot } from '@new26interthing/shared'
import {
  ElMessage,
  ElMessageBox,
} from 'element-plus'

import { useRealtimeSocket } from '../realtime/use-realtime-socket'
import { useControlApi } from './api'

export const useAutomation = (deviceNumber: Ref<string>) => {
  /**
   * 控制页的自动化状态适配层：读取 HTTP 快照并合并 WebSocket 增量状态。
   * 本层只发送用户意图，是否允许执行始终由后端安全门决定。
   */
  const api = useControlApi()
  const {
    automationSnapshots,
    operationalMetricsSnapshots,
    waterFlowSnapshots,
  } = useRealtimeSocket()
  const loading = ref(false)
  const resetting = ref(false)
  const resettingOperationalMetrics = ref(false)
  const resettingFault = ref(false)

  const snapshot = computed<AutomationSnapshot | undefined>(() => {
    const current = automationSnapshots.value[deviceNumber.value]
    if (!current) return undefined
    const flow = waterFlowSnapshots.value[deviceNumber.value]
    return flow ? { ...current, waterFlow: flow } : current
  })
  const operationalMetrics = computed(() => (
    operationalMetricsSnapshots.value[deviceNumber.value]
  ))

  const load = async () => {
    if (!deviceNumber.value) return
    loading.value = true
    try {
      const [result, metrics] = await Promise.all([
        api.getAutomationSnapshot(deviceNumber.value),
        api.getOperationalMetrics(deviceNumber.value),
      ])
      automationSnapshots.value = {
        ...automationSnapshots.value,
        [deviceNumber.value]: result,
      }
      operationalMetricsSnapshots.value = {
        ...operationalMetricsSnapshots.value,
        [deviceNumber.value]: metrics,
      }
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '自动控制状态加载失败')
    }
    finally {
      loading.value = false
    }
  }

  const resetWaterFlow = async () => {
    if (!deviceNumber.value) return
    resetting.value = true
    try {
      const result = await api.resetWaterFlow(deviceNumber.value)
      waterFlowSnapshots.value = {
        ...waterFlowSnapshots.value,
        [deviceNumber.value]: result,
      }
      ElMessage.success('累计水量已清零')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '累计水量清零失败')
    }
    finally {
      resetting.value = false
    }
  }

  const resetFault = async () => {
    if (!deviceNumber.value) return
    try {
      await ElMessageBox.confirm(
        '复位只会解除故障锁定，设备仍保持停止。确认继续吗？',
        '确认故障复位',
        { type: 'warning', confirmButtonText: '确认复位', cancelButtonText: '取消' },
      )
    }
    catch {
      return
    }
    resettingFault.value = true
    try {
      const result = await api.resetAutomationFault(deviceNumber.value)
      automationSnapshots.value = {
        ...automationSnapshots.value,
        [deviceNumber.value]: result,
      }
      ElMessage.success('故障已复位，系统保持停止')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '故障复位失败')
    }
    finally {
      resettingFault.value = false
    }
  }

  const resetOperationalMetrics = async () => {
    if (!deviceNumber.value) return
    try {
      await ElMessageBox.confirm(
        '清零水泵和加热运行时长、一分钟平均流量及出口水温每分钟变化，不删除历史采样数据。确认继续吗？',
        '确认清零运行指标',
        { type: 'warning', confirmButtonText: '确认清零', cancelButtonText: '取消' },
      )
    }
    catch {
      return
    }
    resettingOperationalMetrics.value = true
    try {
      const result = await api.resetOperationalMetrics(deviceNumber.value)
      operationalMetricsSnapshots.value = {
        ...operationalMetricsSnapshots.value,
        [deviceNumber.value]: result,
      }
      const automation = await api.getAutomationSnapshot(deviceNumber.value)
      automationSnapshots.value = {
        ...automationSnapshots.value,
        [deviceNumber.value]: automation,
      }
      waterFlowSnapshots.value = {
        ...waterFlowSnapshots.value,
        [deviceNumber.value]: automation.waterFlow,
      }
      ElMessage.success('实时运行指标已清零')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '运行时长清零失败')
    }
    finally {
      resettingOperationalMetrics.value = false
    }
  }

  watch(deviceNumber, () => void load(), { immediate: true })

  return {
    load,
    loading,
    operationalMetrics,
    resetting,
    resettingFault,
    resettingOperationalMetrics,
    resetFault,
    resetOperationalMetrics,
    resetWaterFlow,
    snapshot,
  }
}
