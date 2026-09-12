<script setup lang="ts">
import { useRealtimeSocket } from '~/features/realtime/use-realtime-socket'
import RealtimeTrendChart from '~/features/realtime/RealtimeTrendChart.vue'
import { useRealtimeTrends } from '~/features/realtime/use-realtime-trends'

const {
  connectionGeneration,
  mqttConnected,
  readings,
  socketStatus,
  trendPoints,
} = useRealtimeSocket()
const selectedDevice = ref('')

const {
  allTrend,
  chartType,
  changeWindowSize,
  errorMessage,
  flowEmptyDescription,
  flowTrend,
  initialize: initializeTrends,
  loading: trendLoading,
  options: trendOptions,
  temperatureTrend,
  temperatureEmptyDescription,
  windowSize,
} = useRealtimeTrends(
  selectedDevice,
  trendPoints,
  connectionGeneration,
)

const deviceNumbers = computed(() => [...new Set([
  ...trendOptions.value.deviceNumbers,
  ...Object.keys(readings.value),
])])
const currentReading = computed(() => readings.value[selectedDevice.value])
const fieldLabels = computed(() => new Map(
  trendOptions.value.fields.map(field => [field.key, field.label]),
))

watch(deviceNumbers, (numbers) => {
  if (!numbers.includes(selectedDevice.value)) {
    selectedDevice.value = numbers[0] ?? ''
  }
}, { immediate: true })

const socketLabels = {
  connecting: '连接中',
  connected: '已连接',
  disconnected: '已断开',
} as const

onMounted(() => {
  void initializeTrends()
})
</script>

<template>
  <!-- 首页就是实时监控页面 -->
  <div class="mx-auto max-w-[1500px] space-y-5">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-slate-900">实时监控</h1>
        <p class="mt-2 mb-0 text-sm text-slate-500">查看 MQTT 设备最新上传的传感器数据</p>
      </div>
      <el-select v-model="selectedDevice" placeholder="等待设备数据" class="w-56" :disabled="deviceNumbers.length === 0">
        <el-option v-for="deviceNo in deviceNumbers" :key="deviceNo" :label="deviceNo" :value="deviceNo" />
      </el-select>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="m-0 text-sm text-slate-500">MQTT 服务</p>
        <p class="mt-3 mb-0 text-lg font-semibold" :class="mqttConnected ? 'text-emerald-600' : 'text-slate-400'">
          {{ mqttConnected ? '已连接' : '未连接' }}
        </p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="m-0 text-sm text-slate-500">实时通道</p>
        <p class="mt-3 mb-0 text-lg font-semibold" :class="socketStatus === 'connected' ? 'text-emerald-600' : 'text-amber-500'">
          {{ socketLabels[socketStatus] }}
        </p>
      </div>
      <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <p class="m-0 text-sm text-slate-500">最新数据时间</p>
        <p class="mt-3 mb-0 text-lg font-semibold text-slate-800">
          {{ currentReading?.recordedAt || '--' }}
        </p>
      </div>
    </div>

    <section class="min-h-80 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="mb-5 flex items-center justify-between">
        <div>
          <h2 class="m-0 text-lg font-semibold text-slate-900">传感器数据</h2>
          <p class="mt-1 mb-0 text-sm text-slate-500">设备编号：{{ selectedDevice || '--' }}</p>
        </div>
        <el-tag v-if="currentReading" type="success" effect="light">实时更新</el-tag>
      </div>

      <div v-if="currentReading && Object.keys(currentReading.fields).length" class="grid grid-cols-4 gap-4">
        <div v-for="(value, name) in currentReading.fields" :key="name" class="rounded-lg bg-slate-50 p-5">
          <p class="m-0 text-sm text-slate-500">
            {{ fieldLabels.get(name) || name }}
          </p>
          <p class="mt-3 mb-0 text-2xl font-semibold text-slate-900">
            {{ value ?? '--' }}
          </p>
        </div>
      </div>
      <el-empty v-else description="等待设备上传传感器数据" />
    </section>

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
            @change="changeWindowSize"
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
        v-loading="trendLoading"
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
          v-loading="trendLoading"
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
          v-loading="trendLoading"
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
  </div>
</template>
