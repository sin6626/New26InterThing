<script setup lang="ts">
import type { FaultStatisticsItem } from '@new26interthing/shared'
import { PieChart } from 'echarts/charts'
import { LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([CanvasRenderer, LegendComponent, PieChart, TooltipComponent])

const props = defineProps<{ items: FaultStatisticsItem[] }>()
const chartElement = ref<HTMLElement>()
let chart: echarts.ECharts | undefined

const render = () => {
  if (!chartElement.value) return
  chart ||= echarts.init(chartElement.value)
  chart.setOption({
    color: ['#dc2626', '#f59e0b', '#7c3aed', '#2563eb', '#64748b'],
    tooltip: { trigger: 'item', formatter: '{b}: {c} 条 ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie',
      radius: ['38%', '68%'],
      center: ['50%', '44%'],
      data: props.items.map((item) => ({ name: item.label, value: item.count })),
      label: { formatter: '{b}\n{c} 条' },
    }],
  }, true)
}

const resize = () => chart?.resize()
onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})
watch(() => props.items, () => nextTick(render), { deep: true })
onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  chart?.dispose()
})
</script>

<template>
  <div class="relative min-h-80">
    <div ref="chartElement" class="h-80 w-full" />
    <el-empty v-if="!items.length" description="暂无故障统计" class="absolute inset-0 bg-white" />
  </div>
</template>
