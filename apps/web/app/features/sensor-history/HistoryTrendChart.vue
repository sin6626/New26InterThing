<script setup lang="ts">
import type { SensorHistoryTrendSeries } from '@new26interthing/shared'
import { BarChart, LineChart, ScatterChart } from 'echarts/charts'
import { DataZoomComponent, GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
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
  times: string[]
  series: SensorHistoryTrendSeries[]
  chartType: 'line' | 'bar' | 'scatter'
}>()

const chartElement = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

const render = () => {
  if (!chartElement.value) return
  // 下面这里等价于 if(!a) a = b, 也就是说a没有值的话, 才把b的值传递给a
  chart ||= echarts.init(chartElement.value)
  chart.setOption({
    animationDuration: 300,
    color: ['#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'],
    tooltip: { trigger: 'axis' },
    legend: { top: 0 },
    grid: { left: 64, right: 24, top: 48, bottom: 42 },
    xAxis: {
      type: 'category',
      data: props.times,
      axisLabel: { formatter: (value: string) => value.slice(5, 16) },
    },
    yAxis: { type: 'value', scale: true },
    dataZoom: props.times.length > 20 ? [{ type: 'inside' }, { type: 'slider', height: 18 }] : [],
    series: props.series.map((series) => ({
      name: `${series.name}${series.unit ? ` (${series.unit})` : ''}`,
      type: props.chartType,
      data: series.data,
      connectNulls: false,
      symbolSize: props.chartType === 'scatter' ? 8 : 5,
      smooth: props.chartType === 'line',
    })),
  }, true)
}

const resize = () => chart?.resize()

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
watch(() => [props.times, props.series, props.chartType], () => nextTick(render), { deep: true })
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>

<template>
  <div class="relative min-h-96">
    <div ref="chartElement" class="h-96 w-full" />
    <el-empty v-if="!times.length" description="暂无趋势数据" class="absolute inset-0 bg-white" />
  </div>
</template>
