import type {
  SensorHistoryOptions,
  SensorHistoryTrend,
  SensorRealtimeData,
} from '@new26interthing/shared'

import { useSensorHistoryApi } from '~/features/sensor-history/api'

import {
  buildRealtimeTrend,
  mergeHistoryTrend,
  type RealtimeTrendPoint,
} from './realtime-trend'

export const useRealtimeTrends = (
  selectedDevice: Ref<string>,
  trendPoints: Ref<Record<string, RealtimeTrendPoint[]>>,
  realtimeDetailPoints: Ref<Record<string, RealtimeTrendPoint[]>>,
  connectionGeneration: Ref<number>,
) => {
  const api = useSensorHistoryApi()
  const options = ref<SensorHistoryOptions>({
    deviceNumbers: [],
    fields: [],
  })
  const history = ref<SensorHistoryTrend>({
    times: [],
    series: [],
  })
  const windowSize = ref<30 | 60 | 120>(60)
  const chartType = ref<'line' | 'bar' | 'scatter'>('line')
  const loading = ref(false)
  const errorMessage = ref('')
  const latestReading = ref<SensorRealtimeData>()
  let requestGeneration = 0
  let latestRequestGeneration = 0

  const loadLatestReading = async () => {
    const deviceNumber = selectedDevice.value
    const currentGeneration = ++latestRequestGeneration

    latestReading.value = undefined
    if (!deviceNumber) return

    try {
      const result = await api.getPage({
        page: 1,
        pageSize: 1,
        deviceNumber,
        status: 'all',
      })
      const latestItem = result.items[0]

      if (currentGeneration === latestRequestGeneration && latestItem?.recordedAt) {
        latestReading.value = {
          deviceNumber,
          recordedAt: latestItem.recordedAt,
          dataKind: String(latestItem.online) === '1' || latestItem.online === '保存数据'
            ? 'backfill'
            : 'realtime',
          fields: latestItem.fields,
        }
      }
    }
    catch {
      if (currentGeneration === latestRequestGeneration) {
        errorMessage.value = '最新传感器数据加载失败，后续实时数据仍会继续更新。'
      }
    }
  }

  const loadHistory = async () => {
    const deviceNumber = selectedDevice.value
    const requestedWindowSize = windowSize.value
    const currentGeneration = ++requestGeneration

    if (!deviceNumber) {
      history.value = {
        times: [],
        series: [],
      }
      loading.value = false
      return
    }

    history.value = {
      times: [],
      series: [],
    }
    loading.value = true
    errorMessage.value = ''

    try {
      const result = await api.getTrend({
        deviceNumber,
        status: 'all',
        limit: requestedWindowSize,
      })

      if (currentGeneration === requestGeneration) {
        history.value = result
      }
    }
    catch {
      if (currentGeneration === requestGeneration) {
        history.value = {
          times: [],
          series: [],
        }
        errorMessage.value = '实时趋势历史数据加载失败，后续实时数据仍会继续更新。'
      }
    }
    finally {
      if (currentGeneration === requestGeneration) {
        loading.value = false
      }
    }
  }

  const merged = computed(() => mergeHistoryTrend(
    history.value,
    trendPoints.value[selectedDevice.value] || [],
    windowSize.value,
  ))
  const detailMerged = computed(() => mergeHistoryTrend(
    history.value,
    realtimeDetailPoints.value[selectedDevice.value] || [],
    windowSize.value,
  ))

  const allTrend = computed(() => buildRealtimeTrend(
    merged.value.points,
    merged.value.metadata,
    'all',
  ))
  const temperatureTrend = computed(() => buildRealtimeTrend(
    detailMerged.value.points,
    detailMerged.value.metadata,
    'temperature',
  ))
  const flowTrend = computed(() => buildRealtimeTrend(
    detailMerged.value.points,
    detailMerged.value.metadata,
    'flow',
  ))
  const temperatureEmptyDescription = computed(() => history.value.series.some(
    series => series.key === 'temp_in' || series.key === 'temp_out',
  )
    ? '暂无温度趋势数据'
    : '未配置入口或出口温度字段')
  const flowEmptyDescription = computed(() => history.value.series.some(
    series => series.key === 'flow_rate',
  )
    ? '暂无流量趋势数据'
    : '未配置流量字段')

  const changeWindowSize = () => {
    void loadHistory()
  }

  const initialize = async () => {
    try {
      options.value = await api.getOptions()
    }
    catch {
      errorMessage.value = '实时趋势字段配置加载失败。'
    }
  }

  watch(selectedDevice, () => {
    void loadHistory()
    void loadLatestReading()
  })
  watch(connectionGeneration, (current, previous) => {
    if (previous > 0 && current > previous) {
      void loadHistory()
    }
  })

  return {
    allTrend,
    chartType,
    changeWindowSize,
    errorMessage,
    flowEmptyDescription,
    flowTrend,
    initialize,
    latestReading,
    loading,
    loadHistory,
    options,
    temperatureTrend,
    temperatureEmptyDescription,
    windowSize,
  }
}
