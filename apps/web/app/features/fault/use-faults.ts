import type { FaultItem, FaultOptions, FaultStatisticsItem } from '@new26interthing/shared'
import dayjs from 'dayjs'

import { useFaultApi } from './api'

/** 同步加载故障列表、筛选项和统计数据，并统一维护分页状态。 */
export const useFaults = () => {
  const api = useFaultApi()
  const loading = ref(false)
  const errorMessage = ref('')
  const rows = ref<FaultItem[]>([])
  const statistics = ref<FaultStatisticsItem[]>([])
  const options = ref<FaultOptions>({ deviceNumbers: [], types: [] })
  const filters = reactive({ deviceNumber: '', type: '' })
  const startTime = ref<Date | null>(null)
  const endTime = ref<Date | null>(null)
  const page = reactive({ current: 1, size: 20 })
  const total = ref(0)

  const requestFilters = computed(() => ({
    deviceNumber: filters.deviceNumber || undefined,
    type: filters.type || undefined,
    startTime: startTime.value ? dayjs(startTime.value).format('YYYY-MM-DD HH:mm:ss') : undefined,
    endTime: endTime.value ? dayjs(endTime.value).format('YYYY-MM-DD HH:mm:ss') : undefined,
  }))

  const fetchPage = () => api.getPage({ ...requestFilters.value, page: page.current, pageSize: page.size })
  const fetchStatistics = () => api.getStatistics(requestFilters.value)

  const search = async () => {
    page.current = 1
    loading.value = true
    errorMessage.value = ''
    try {
      const [pageResult, statisticsResult] = await Promise.all([fetchPage(), fetchStatistics()])
      rows.value = pageResult.items
      total.value = pageResult.total
      statistics.value = statisticsResult
    } catch {
      rows.value = []
      statistics.value = []
      total.value = 0
      errorMessage.value = '故障信息加载失败，请检查查询条件和后端连接。'
    } finally {
      loading.value = false
    }
  }

  const loadCurrentPage = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      const result = await fetchPage()
      rows.value = result.items
      total.value = result.total
    } catch {
      rows.value = []
      total.value = 0
      errorMessage.value = '故障列表加载失败。'
    } finally {
      loading.value = false
    }
  }

  const reset = () => {
    filters.deviceNumber = ''
    filters.type = ''
    startTime.value = null
    endTime.value = null
    void search()
  }

  const initialize = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      options.value = await api.getOptions()
      const [pageResult, statisticsResult] = await Promise.all([fetchPage(), fetchStatistics()])
      rows.value = pageResult.items
      total.value = pageResult.total
      statistics.value = statisticsResult
    } catch {
      rows.value = []
      statistics.value = []
      total.value = 0
      errorMessage.value = '故障信息初始化失败，请检查后端和数据库连接。'
    } finally {
      loading.value = false
    }
  }

  return {
    endTime, errorMessage, filters, initialize, loadCurrentPage, loading,
    options, page, reset, rows, search, startTime, statistics, total,
  }
}
