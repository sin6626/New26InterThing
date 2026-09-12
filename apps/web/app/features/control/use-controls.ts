import type {
  ControlField,
  ControlSnapshot,
} from '@new26interthing/shared'
import { ElMessage, ElMessageBox } from 'element-plus'

import { useControlApi } from './api'

export const useControls = () => {
  const api = useControlApi()
  const snapshot = ref<ControlSnapshot>({ deviceNumber: '', fields: [] })
  const deviceNumbers = ref<string[]>([])
  const selectedDevice = ref('')
  const loading = ref(false)
  const savingId = ref<number>()
  const errorMessage = ref('')
  const syncingTime = ref(false)

  const visibleFields = computed(() => snapshot.value.fields.filter((field) => {
    if (field.parentId === null) return true
    const parent = snapshot.value.fields.find(item => item.configId === field.parentId)
    return parent?.value === field.parentValue
  }))

  const load = async () => {
    if (!selectedDevice.value) return
    loading.value = true
    errorMessage.value = ''
    try {
      snapshot.value = await api.getSnapshot(selectedDevice.value)
    }
    catch {
      snapshot.value = { deviceNumber: selectedDevice.value, fields: [] }
      errorMessage.value = '控制配置加载失败，请检查后端和数据库连接。'
    }
    finally {
      loading.value = false
    }
  }

  const initialize = async () => {
    const { useDeviceApi } = await import('~/features/device/api')
    try {
      const devices = await useDeviceApi().listDevices({
        page: 1,
        pageSize: 100,
      })
      deviceNumbers.value = devices.items
        .map(device => device.number)
        .filter((number): number is string => Boolean(number))
      selectedDevice.value = deviceNumbers.value[0] || ''
    }
    catch {
      errorMessage.value = '设备或控制配置加载失败。'
    }
  }

  const update = async (
    field: ControlField,
    value: string | number | boolean | string[],
  ) => {
    if (field.heaterStartBlocked && (value === true || value === 'on')) {
      ElMessage.warning('安全保护尚未完成，当前禁止人工开启加热')
      return
    }
    if (field.automaticStartBlocked && (value === true || value === 'on')) {
      ElMessage.warning('自动水循环尚未完成，当前禁止启动自动模式')
      return
    }
    try {
      await ElMessageBox.confirm(
        `设备：${selectedDevice.value}\n指令：${field.name}\n原值：${field.value ?? '--'}\n新值：${String(value)}`,
        '确认下发指令',
        {
          confirmButtonText: '确认执行',
          cancelButtonText: '取消',
          type: 'warning',
        },
      )
    }
    catch {
      return
    }

    savingId.value = field.configId
    try {
      await api.execute({
        deviceNumber: selectedDevice.value,
        configId: field.configId,
        value,
      })
      ElMessage.success('操作已处理，页面展示的是设备期望值')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '操作失败')
    }
    finally {
      savingId.value = undefined
      await load()
    }
  }

  const syncTime = async () => {
    if (!selectedDevice.value) return
    syncingTime.value = true
    try {
      await api.syncTime(selectedDevice.value)
      ElMessage.success('当前时间已发布到设备')
    }
    catch (error) {
      ElMessage.error(error instanceof Error ? error.message : '时间同步失败')
    }
    finally {
      syncingTime.value = false
    }
  }

  watch(selectedDevice, () => void load(), { immediate: false })

  return {
    deviceNumbers,
    errorMessage,
    initialize,
    loading,
    savingId,
    selectedDevice,
    syncingTime,
    syncTime,
    update,
    visibleFields,
  }
}
