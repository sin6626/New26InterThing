<script setup lang="ts">
import type {
  OperationalMetricsSnapshot,
  WaterFlowSnapshot,
} from '@new26interthing/shared'
import { formatDuration } from '~/utils/format-duration'

defineProps<{
  disabled: boolean
  loading: boolean
  resetting: boolean
  runtimeResetting: boolean
  snapshot?: WaterFlowSnapshot
  operationalMetrics?: OperationalMetricsSnapshot
}>()

defineEmits<{
  reset: []
  resetRuntime: []
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
          根据设备实时反馈计算，累计结果在后端持久化
        </p>
      </div>
      <div class="flex gap-2">
        <el-button
          :loading="runtimeResetting"
          :disabled="disabled"
          @click="$emit('resetRuntime')"
        >
          清零运行时长
        </el-button>
        <el-button
          :loading="resetting"
          :disabled="disabled"
          @click="$emit('reset')"
        >
          清零累计水量
        </el-button>
      </div>
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
