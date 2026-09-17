import type {
  SensorHistoryField,
  SensorHistoryItem,
  SensorHistoryOptions,
  SensorHistoryOperationalMetrics,
  SensorHistoryTrend,
} from '@new26interthing/shared'
import dayjs from 'dayjs'

import { useSensorHistoryApi } from './api'
import { resolveHistoryDeviceNumber } from './history-query'

/** 封装历史页的筛选、分页、选择识别和趋势加载，页面模板只负责布局。 */
export const useSensorHistory = () => {
  const api = useSensorHistoryApi()
  const loading = ref(false)
  const errorMessage = ref('')
  const rows = ref<SensorHistoryItem[]>([])
  const options = ref<SensorHistoryOptions>({ deviceNumbers: [], fields: [] })
  const trend = ref<SensorHistoryTrend>({ times: [], series: [] })
  const operationalMetrics = ref<SensorHistoryOperationalMetrics | null>(null)
  const operationalMetricsError = ref('')
  const operationalMetricsLoading = ref(false)
  const total = ref(0)
  const filters = reactive({ deviceNumber: '', status: 'all' as 'all' | 'normal' | 'abnormal' })
  const timeRange = ref<[Date, Date] | null>(null)
  const page = reactive({ current: 1, size: 20 })
  const trendLimit = ref(10)
  const chartType = ref<'line' | 'bar' | 'scatter'>('line')
  const selectedRows = ref<SensorHistoryItem[]>([])
  const recognizing = ref(false)

  const requestFilters = computed(() => ({
    deviceNumber: filters.deviceNumber || undefined,
    status: filters.status,
    startTime: timeRange.value ? dayjs(timeRange.value[0]).format('YYYY-MM-DD HH:mm:ss') : undefined,
    endTime: timeRange.value ? dayjs(timeRange.value[1]).format('YYYY-MM-DD HH:mm:ss') : undefined,
  }))

  const ensureDeviceSelection = () => {
    filters.deviceNumber = resolveHistoryDeviceNumber(
      filters.deviceNumber,
      options.value.deviceNumbers,
    )
  }

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

  const loadOperationalMetrics = async () => {
    operationalMetricsError.value = ''
    ensureDeviceSelection()
    if (!filters.deviceNumber) {
      operationalMetrics.value = null
      return
    }
    operationalMetricsLoading.value = true
    try {
      operationalMetrics.value = await api.getOperationalMetrics({
        deviceNumber: filters.deviceNumber,
        startTime: requestFilters.value.startTime,
        endTime: requestFilters.value.endTime,
      })
    } catch {
      operationalMetrics.value = null
      operationalMetricsError.value = '历史运行指标加载失败。'
    } finally {
      operationalMetricsLoading.value = false
    }
  }

  const search = async () => {
    ensureDeviceSelection()
    page.current = 1
    loading.value = true
    errorMessage.value = ''
    try {
      await Promise.all([loadPage(), loadTrend(), loadOperationalMetrics()])
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
    filters.deviceNumber = resolveHistoryDeviceNumber('', options.value.deviceNumbers)
    filters.status = 'all'
    timeRange.value = null
    void search()
  }

  const fieldValue = (row: unknown, field: SensorHistoryField) =>
    (row as SensorHistoryItem).fields[field.key] ?? '--'

  const updateSelection = (selection: SensorHistoryItem[]) => { selectedRows.value = selection }
  const recognize = async () => {
    if (!selectedRows.value.length) { ElMessage.warning('请先勾选需要识别的历史数据'); return }
    recognizing.value = true
    try {
      const result = await api.recognize(selectedRows.value.map(row => row.id))
      ElMessage.success(result.message)
      await navigateTo('/behaviors')
    } catch (error) {
      const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message
      ElMessage.error(message || (error instanceof Error ? error.message : '智能识别失败'))
    } finally { recognizing.value = false }
  }

  const initialize = async () => {
    loading.value = true
    try {
      options.value = await api.getOptions()
      ensureDeviceSelection()
      await Promise.all([loadPage(), loadTrend(), loadOperationalMetrics()])
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
    operationalMetrics,
    operationalMetricsError,
    operationalMetricsLoading,
    page,
    reset,
    recognize,
    recognizing,
    rows,
    search,
    timeRange,
    total,
    trend,
    trendLimit,
    updateSelection,
  }
}
