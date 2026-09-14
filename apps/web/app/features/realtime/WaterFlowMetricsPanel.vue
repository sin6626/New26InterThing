<script setup lang="ts">
import type {
  OperationalMetricsSnapshot,
  WaterFlowSnapshot,
} from '@new26interthing/shared'

defineProps<{
  disabled: boolean
  loading: boolean
  resetting: boolean
  snapshot?: WaterFlowSnapshot
  operationalMetrics?: OperationalMetricsSnapshot
}>()

const formatDuration = (seconds?: number) => {
  const total = Math.max(0, Math.floor(seconds ?? 0))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const remainingSeconds = total % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours}小时`)
  if (minutes) parts.push(`${minutes}分`)
  if (remainingSeconds || !parts.length) parts.push(`${remainingSeconds}秒`)
  return parts.join('')
}

defineEmits<{
  reset: []
}>()
</script>

<template>
  <section
    v-loading="loading"
    class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
  >
    <div class="mb-5 flex items-center justify-between">
      <div>
        <h2 class="m-0 text-lg font-semibold text-slate-900">水循环运行指标</h2>
        <p class="mt-1 mb-0 text-sm text-slate-500">
          根据实时流量计算，累计结果在后端持久化
        </p>
      </div>
      <el-button
        :loading="resetting"
        :disabled="disabled"
        @click="$emit('reset')"
      >
        清零累计水量
      </el-button>
    </div>

    <div class="grid grid-cols-4 gap-4">
      <div class="rounded-lg bg-slate-50 p-5">
        <p class="m-0 text-sm text-slate-500">瞬时流量</p>
        <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
          {{ snapshot?.flowRateLitersPerMinute ?? '--' }}
          <span class="text-sm font-normal text-slate-500">L/min</span>
        </p>
      </div>
      <div class="rounded-lg bg-slate-50 p-5">
        <p class="m-0 text-sm text-slate-500">一分钟平均流量</p>
        <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
          {{ snapshot?.averageFlowOneMinute ?? '--' }}
          <span class="text-sm font-normal text-slate-500">L/min</span>
        </p>
      </div>
      <div class="rounded-lg bg-slate-50 p-5">
        <p class="m-0 text-sm text-slate-500">管内流速</p>
        <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
          {{ snapshot?.flowVelocityMetersPerSecond ?? '--' }}
          <span class="text-sm font-normal text-slate-500">m/s</span>
        </p>
        <p
          v-if="snapshot?.velocityStatus === 'unconfigured'"
          class="mt-2 mb-0 text-xs text-amber-600"
        >
          请先配置管道内径
        </p>
      </div>
      <div class="rounded-lg bg-slate-50 p-5">
        <p class="m-0 text-sm text-slate-500">累计水量</p>
        <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
          {{ snapshot?.totalVolumeLiters ?? '--' }}
          <span class="text-sm font-normal text-slate-500">L</span>
        </p>
      </div>
      <div class="rounded-lg bg-slate-50 p-5">
        <p class="m-0 text-sm text-slate-500">水泵运行时长</p>
        <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
          {{ formatDuration(operationalMetrics?.pumpRuntimeSeconds) }}
        </p>
      </div>
      <div class="rounded-lg bg-slate-50 p-5">
        <p class="m-0 text-sm text-slate-500">加热运行时长</p>
        <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
          {{ formatDuration(operationalMetrics?.heaterRuntimeSeconds) }}
        </p>
      </div>
      <div class="rounded-lg bg-slate-50 p-5">
        <p class="m-0 text-sm text-slate-500">出口水温每分钟变化</p>
        <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
          {{ operationalMetrics?.outletHeatingRatePerMinute ?? '--' }}
          <span class="text-sm font-normal text-slate-500">℃/min</span>
        </p>
      </div>
    </div>
  </section>
</template>
