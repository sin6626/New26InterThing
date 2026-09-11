<script setup lang="ts">
import type {
  SensorHistoryField,
  SensorHistoryItem,
  SensorHistoryOptions,
  SensorHistoryTrend,
} from '@new26interthing/shared'
import dayjs from 'dayjs'

import HistoryTrendChart from '~/features/sensor-history/HistoryTrendChart.vue'
import { useSensorHistoryApi } from '~/features/sensor-history/api'

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
  trend.value = await api.getTrend({ ...requestFilters.value, limit: trendLimit.value })
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

const reset = () => {
  filters.deviceNumber = ''
  filters.status = 'all'
  timeRange.value = null
  void search()
}

const fieldValue = (row: unknown, field: SensorHistoryField) => (row as SensorHistoryItem).fields[field.key] ?? '--'

onMounted(async () => {
  loading.value = true
  try {
    options.value = await api.getOptions()
    await Promise.all([loadPage(), loadTrend()])
  } catch {
    errorMessage.value = '历史数据初始化失败，请检查后端和数据库连接。'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-4">
    <div>
      <h1 class="m-0 text-2xl font-semibold text-slate-900">历史数据</h1>
      <p class="mt-2 mb-0 text-sm text-slate-500">按设备和时间查询传感器记录及变化趋势</p>
    </div>

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <el-form :inline="true" class="flex flex-wrap items-center gap-y-3">
        <el-form-item label="设备" class="mb-0">
          <el-select v-model="filters.deviceNumber" clearable placeholder="全部设备" style="width: 210px">
            <el-option v-for="number in options.deviceNumbers" :key="number" :label="number" :value="number" />
          </el-select>
        </el-form-item>
        <el-form-item label="时间范围" class="mb-0">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            class="w-96"
          />
        </el-form-item>
        <el-form-item label="状态" class="mb-0">
          <el-select v-model="filters.status" style="width: 140px">
            <el-option label="全部数据" value="all" />
            <el-option label="正常" value="normal" />
            <el-option label="告警" value="abnormal" />
          </el-select>
        </el-form-item>
        <el-form-item class="mb-0">
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-800">历史记录</span>
          <span class="text-sm text-slate-500">共 {{ total }} 条</span>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column type="index" label="序号" width="70" />
        <el-table-column prop="deviceNumber" label="设备编号" min-width="180" />
        <el-table-column v-for="field in options.fields" :key="field.key" :label="`${field.label}${field.unit ? ` (${field.unit})` : ''}`" min-width="130">
          <template #default="scope">{{ fieldValue(scope.row, field) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 0 ? 'success' : 'danger'" size="small">
              {{ scope.row.status === 0 ? '正常' : '告警' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="online" label="数据类型" width="110" />
        <el-table-column prop="recordedAt" label="采集时间" width="180" />
        <template #empty><el-empty description="暂无历史数据" /></template>
      </el-table>
      <div class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="page.current"
          v-model:page-size="page.size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadCurrentPage"
          @size-change="search"
        />
      </div>
    </el-card>

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <span class="font-medium text-slate-800">传感器历史趋势</span>
          <div class="flex gap-3">
            <el-select v-model="trendLimit" style="width: 130px" @change="loadTrend">
              <el-option label="最近 10 点" :value="10" />
              <el-option label="最近 30 点" :value="30" />
              <el-option label="最近 60 点" :value="60" />
              <el-option label="最近 120 点" :value="120" />
            </el-select>
            <el-select v-model="chartType" style="width: 110px">
              <el-option label="折线图" value="line" />
              <el-option label="柱状图" value="bar" />
              <el-option label="散点图" value="scatter" />
            </el-select>
          </div>
        </div>
      </template>
      <HistoryTrendChart :times="trend.times" :series="trend.series" :chart-type="chartType" />
    </el-card>
  </div>
</template>
