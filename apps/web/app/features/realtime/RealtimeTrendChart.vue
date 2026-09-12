<script setup lang="ts">
import type { SensorHistoryTrend } from '@new26interthing/shared'
import {
  BarChart,
  LineChart,
  ScatterChart,
} from 'echarts/charts'
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([
  BarChart,
  CanvasRenderer,
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  LineChart,
  ScatterChart,
  TooltipComponent,
])

const props = defineProps<{
  title: string
  trend: SensorHistoryTrend
  chartType: 'line' | 'bar' | 'scatter'
  emptyDescription: string
  compact?: boolean
}>()

const chartElement = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

const palette = [
  '#2563eb',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
]

const colorForKey = (key: string) => {
  const hash = [...key].reduce(
    (value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0,
    0,
  )
  return palette[hash % palette.length]
}

const render = () => {
  if (!chartElement.value || !props.trend.times.length || !props.trend.series.length) {
    chart?.dispose()
    chart = undefined
    return
  }

  chart ||= echarts.init(chartElement.value)
  chart.setOption({
    animationDuration: 250,
    tooltip: {
      trigger: 'axis',
    },
    legend: {
      top: 32,
      type: 'scroll',
    },
    grid: {
      left: 56,
      right: 24,
      top: 80,
      bottom: props.trend.times.length > 20 ? 58 : 36,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: props.trend.times,
      axisLabel: {
        formatter: (value: string) => value.slice(5, 16),
      },
    },
    yAxis: {
      type: 'value',
      scale: true,
    },
    dataZoom: props.trend.times.length > 20
      ? [
          { type: 'inside' },
          { type: 'slider', height: 18 },
        ]
      : [],
    series: props.trend.series.map(series => ({
      name: `${series.name}${series.unit ? ` (${series.unit})` : ''}`,
      type: props.chartType,
      data: series.data,
      connectNulls: false,
      symbolSize: props.chartType === 'scatter' ? 8 : 5,
      smooth: props.chartType === 'line',
      itemStyle: {
        color: colorForKey(series.key),
      },
      lineStyle: {
        color: colorForKey(series.key),
        width: 2,
      },
    })),
  }, true)
}

const resize = () => chart?.resize()

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})

watch(
  () => [props.trend, props.chartType],
  () => nextTick(render),
  { deep: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>

<template>
  <div>
    <h3 class="m-0 text-base font-semibold text-slate-800">
      {{ title }}
    </h3>
    <div class="relative mt-3" :class="compact ? 'min-h-80' : 'min-h-96'">
      <div
        ref="chartElement"
        class="w-full"
        :class="compact ? 'h-80' : 'h-96'"
      />
      <el-empty
        v-if="!trend.times.length || !trend.series.length"
        :description="emptyDescription"
        class="absolute inset-0 bg-white"
      />
    </div>
  </div>
</template>
