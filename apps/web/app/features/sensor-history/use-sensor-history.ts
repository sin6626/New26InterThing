import type {
  SensorHistoryField,
  SensorHistoryItem,
  SensorHistoryOptions,
  SensorHistoryTrend,
} from '@new26interthing/shared'
import dayjs from 'dayjs'

import { useSensorHistoryApi } from './api'

export const useSensorHistory = () => {
  const api = useSensorHistoryApi()
  const loading = ref(false)
  const errorMessage = ref('')
  const rows = ref<SensorHistoryItem[]>([])
  const options = ref<SensorHistoryOptions>({ deviceNumbers: [], fields: [] })
  const trend = ref<SensorHistoryTrend>({ times: [], series: [] })
  const total = ref(0)
  const filters = reactive({ deviceNumber: '', status: 'all' as 'all' | 'normal' | 'abnormal' })
  const timeRange = ref<[Date, Date] | null>(null)
  const page = reactive({ current: 1, size: 20 })
  const trendLimit = ref(10)
  const chartType = ref<'line' | 'bar' | 'scatter'>('line')

  const requestFilters = computed(() => ({
    deviceNumber: filters.deviceNumber || undefined,
    status: filters.status,
    startTime: timeRange.value ? dayjs(timeRange.value[0]).format('YYYY-MM-DD HH:mm:ss') : undefined,
    endTime: timeRange.value ? dayjs(timeRange.value[1]).format('YYYY-MM-DD HH:mm:ss') : undefined,
  }))

  const loadPage = async () => {
    const result = await api.getPage({
      ...requestFilters.value,
      page: page.current,
      pageSize: page.size,
    })
    rows.value = result.items
    total.value = result.total
  }

  const loadTrend = async () => {
    try {
      trend.value = await api.getTrend({ ...requestFilters.value, limit: trendLimit.value })
    } catch (error) {
      trend.value = { times: [], series: [] }
      errorMessage.value = '历史趋势加载失败。'
      throw error
    }
  }

  const search = async () => {
    page.current = 1
    loading.value = true
    errorMessage.value = ''
    try {
      await Promise.all([loadPage(), loadTrend()])
    } catch {
      rows.value = []
      total.value = 0
      trend.value = { times: [], series: [] }
      errorMessage.value = '历史数据加载失败，请检查查询条件和后端连接。'
    } finally {
      loading.value = false
    }
  }

  const loadCurrentPage = async () => {
    loading.value = true
    errorMessage.value = ''
    try {
      await loadPage()
    } catch {
      rows.value = []
      total.value = 0
      errorMessage.value = '历史列表加载失败。'
    } finally {
      loading.value = false
    }
  }

  const changeTrendLimit = async () => {
    errorMessage.value = ''
    try {
      await loadTrend()
    } catch {
      // loadTrend 已清空旧趋势并给出页面错误。
    }
  }

  const reset = () => {
    filters.deviceNumber = ''
    filters.status = 'all'
    timeRange.value = null
    void search()
  }

  const fieldValue = (row: unknown, field: SensorHistoryField) =>
    (row as SensorHistoryItem).fields[field.key] ?? '--'

  const initialize = async () => {
    loading.value = true
    try {
      options.value = await api.getOptions()
      await Promise.all([loadPage(), loadTrend()])
    } catch {
      rows.value = []
      total.value = 0
      trend.value = { times: [], series: [] }
      errorMessage.value = '历史数据初始化失败，请检查后端和数据库连接。'
    } finally {
      loading.value = false
    }
  }

  return {
    chartType,
    changeTrendLimit,
    errorMessage,
    fieldValue,
    filters,
    initialize,
    loadCurrentPage,
    loading,
    options,
    page,
    reset,
    rows,
    search,
    timeRange,
    total,
    trend,
    trendLimit,
  }
}
