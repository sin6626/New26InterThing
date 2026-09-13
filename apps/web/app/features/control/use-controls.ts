import type {
  ControlField,
  ControlSnapshot,
} from '@new26interthing/shared'
import { ElMessage } from 'element-plus'

import { useControlApi } from './api'

export interface ControlTreeNode extends ControlField {
  children: ControlTreeNode[]
}

export const useControls = () => {
  const api = useControlApi()
  const snapshot = ref<ControlSnapshot>({ deviceNumber: '', fields: [] })
  const deviceNumbers = ref<string[]>([])
  const selectedDevice = ref('')
  const loading = ref(false)
  const savingId = ref<number>()
  const errorMessage = ref('')
  const syncingTime = ref(false)

  const controlTree = computed<ControlTreeNode[]>(() => {
    const fields = snapshot.value.fields

    const buildChildren = (
      parent: ControlField,
      ancestors: Set<number>,
    ): ControlTreeNode[] => fields
      .filter(field => field.parentId === parent.configId)
      .filter(field => field.parentValue === null || field.parentValue === parent.value)
      .filter(field => !ancestors.has(field.configId))
      .map((field) => {
        const nextAncestors = new Set(ancestors)
        nextAncestors.add(field.configId)
        return {
          ...field,
          children: buildChildren(field, nextAncestors),
        }
      })

    return fields
      .filter(field => field.parentId === null)
      .map(field => ({
        ...field,
        children: buildChildren(field, new Set([field.configId])),
      }))
  })

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
    savingId.value = field.configId
    try {
      const result = await api.execute({
        deviceNumber: selectedDevice.value,
        configId: field.configId,
        value,
      })
      field.value = result.value
      ElMessage.success('修改成功')
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
    controlTree,
    deviceNumbers,
    errorMessage,
    initialize,
    loading,
    savingId,
    selectedDevice,
    syncingTime,
    syncTime,
    update,
  }
}
