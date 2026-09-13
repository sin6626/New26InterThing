import type { AutomationSnapshot } from '@new26interthing/shared'
import {
  ElMessage,
  ElMessageBox,
} from 'element-plus'

import { useRealtimeSocket } from '../realtime/use-realtime-socket'
import { useControlApi } from './api'

export const useAutomation = (deviceNumber: Ref<string>) => {
  const api = useControlApi()
  const {
    automationSnapshots,
    waterFlowSnapshots,
  } = useRealtimeSocket()
  const loading = ref(false)
  const resetting = ref(false)
  const resettingFault = ref(false)

  const snapshot = computed<AutomationSnapshot | undefined>(() => {
    const current = automationSnapshots.value[deviceNumber.value]
    if (!current) return undefined
    const flow = waterFlowSnapshots.value[deviceNumber.value]
    return flow ? { ...current, waterFlow: flow } : current
  })

  const load = async () => {
    if (!deviceNumber.value) return
    loading.value = true
    try {
      const result = await api.getAutomationSnapshot(deviceNumber.value)
      automationSnapshots.value = {
        ...automationSnapshots.value,
        [deviceNumber.value]: result,
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

  watch(deviceNumber, () => void load(), { immediate: true })

  return {
    load,
    loading,
    resetting,
    resettingFault,
    resetFault,
    resetWaterFlow,
    snapshot,
  }
}
