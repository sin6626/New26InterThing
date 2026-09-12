import type {
  OperationLogItem,
  OperationLogOptions,
} from '@new26interthing/shared'
import dayjs from 'dayjs'

import { useControlApi } from './api'

export const useOperationLogs = () => {
  const api = useControlApi()
  const rows = ref<OperationLogItem[]>([])
  const options = ref<OperationLogOptions>({
    deviceNumbers: [],
    commandTypes: [],
    results: [],
  })
  const filters = reactive({
    deviceNumber: '',
    commandType: '',
    result: '',
  })
  const timeRange = ref<[Date, Date] | null>(null)
  const page = reactive({ current: 1, size: 20 })
  const total = ref(0)
  const loading = ref(false)
  const errorMessage = ref('')

  const load = async (resetPage = false) => {
    if (resetPage) page.current = 1
    loading.value = true
    errorMessage.value = ''
    try {
      const result = await api.getLogs({
        page: page.current,
        pageSize: page.size,
        deviceNumber: filters.deviceNumber || undefined,
        commandType: filters.commandType || undefined,
        result: filters.result || undefined,
        startTime: timeRange.value
          ? dayjs(timeRange.value[0]).format('YYYY-MM-DD HH:mm:ss')
          : undefined,
        endTime: timeRange.value
          ? dayjs(timeRange.value[1]).format('YYYY-MM-DD HH:mm:ss')
          : undefined,
      })
      rows.value = result.items
      total.value = result.total
    }
    catch {
      rows.value = []
      total.value = 0
      errorMessage.value = '操作日志加载失败。'
    }
    finally {
      loading.value = false
    }
  }

  const initialize = async () => {
    try {
      options.value = await api.getLogOptions()
      await load()
    }
    catch {
      errorMessage.value = '操作日志初始化失败。'
    }
  }
  const reset = () => {
    Object.assign(filters, {
      deviceNumber: '',
      commandType: '',
      result: '',
    })
    timeRange.value = null
    void load(true)
  }

  return {
    errorMessage,
    filters,
    initialize,
    load,
    loading,
    options,
    page,
    reset,
    rows,
    timeRange,
    total,
  }
}
