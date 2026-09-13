<script setup lang="ts">
import type { SensorHistoryTrend } from '@new26interthing/shared'

import RealtimeTrendChart from './RealtimeTrendChart.vue'

defineProps<{
  allTrend: SensorHistoryTrend
  errorMessage: string
  flowEmptyDescription: string
  flowTrend: SensorHistoryTrend
  loading: boolean
  temperatureEmptyDescription: string
  temperatureTrend: SensorHistoryTrend
}>()

const chartType = defineModel<'line' | 'bar' | 'scatter'>('chartType', {
  required: true,
})
const windowSize = defineModel<30 | 60 | 120>('windowSize', {
  required: true,
})

defineEmits<{
  changeWindow: []
}>()
</script>

<template>
  <el-alert
    v-if="errorMessage"
    :title="errorMessage"
    type="warning"
    show-icon
    :closable="false"
  />

  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="m-0 text-lg font-semibold text-slate-900">传感器实时趋势</h2>
        <p class="mt-1 mb-0 text-sm text-slate-500">
          历史数据补充初始窗口，WebSocket 持续更新当前分钟
        </p>
      </div>
      <div class="flex gap-3">
        <el-select
          v-model="windowSize"
          style="width: 130px"
          @change="$emit('changeWindow')"
        >
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

    <el-card
      v-loading="loading"
      shadow="never"
      class="rounded-xl border-slate-200"
    >
      <RealtimeTrendChart
        title="全部传感器趋势"
        :trend="allTrend"
        :chart-type="chartType"
        empty-description="暂无传感器趋势数据"
      />
    </el-card>

    <div class="grid grid-cols-2 gap-4">
      <el-card
        v-loading="loading"
        shadow="never"
        class="min-w-0 rounded-xl border-slate-200"
      >
        <RealtimeTrendChart
          title="温度趋势"
          :trend="temperatureTrend"
          :chart-type="chartType"
          :empty-description="temperatureEmptyDescription"
          compact
        />
      </el-card>

      <el-card
        v-loading="loading"
        shadow="never"
        class="min-w-0 rounded-xl border-slate-200"
      >
        <RealtimeTrendChart
          title="流量趋势"
          :trend="flowTrend"
          :chart-type="chartType"
          :empty-description="flowEmptyDescription"
          compact
        />
      </el-card>
    </div>
  </section>
</template>
