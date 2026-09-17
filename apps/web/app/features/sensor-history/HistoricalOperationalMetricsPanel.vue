<script setup lang="ts">
import type { SensorHistoryOperationalMetrics } from '@new26interthing/shared'

import HistoryTrendChart from './HistoryTrendChart.vue'
import { formatDuration } from '~/utils/format-duration'

const props = defineProps<{
  loading: boolean
  errorMessage: string
  metrics: SensorHistoryOperationalMetrics | null
  hasTimeRange: boolean
}>()

const temperatureSeries = computed(() => [{
  key: 'outlet_temperature_rate',
  name: '出口水温每分钟变化',
  unit: '℃/min',
  data: props.metrics?.outletTemperatureRate.data ?? [],
}])
</script>

<template>
  <el-card v-loading="loading" shadow="never" class="rounded-xl border-slate-200">
    <template #header>
      <div>
        <span class="font-medium text-slate-800">历史运行指标</span>
        <p class="mt-1 mb-0 text-xs text-slate-500">
          根据设备历史采样估算，断档时间不计入；{{ hasTimeRange ? '统计当前筛选时间范围' : '默认统计最近 120 分钟' }}
        </p>
      </div>
    </template>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
      class="mb-4"
    />

    <template v-if="metrics">
      <div class="mb-5 grid grid-cols-2 gap-4">
        <div class="rounded-lg bg-slate-50 p-5">
          <p class="m-0 text-sm text-slate-500">水泵估算运行时长</p>
          <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
            {{ formatDuration(metrics.pumpRuntimeSeconds) }}
          </p>
        </div>
        <div class="rounded-lg bg-slate-50 p-5">
          <p class="m-0 text-sm text-slate-500">加热估算运行时长</p>
          <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
            {{ formatDuration(metrics.heaterRuntimeSeconds) }}
          </p>
        </div>
      </div>

      <HistoryTrendChart
        :times="metrics.outletTemperatureRate.times"
        :series="temperatureSeries"
        chart-type="line"
        include-zero
      />
    </template>
  </el-card>
</template>
