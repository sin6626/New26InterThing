<script setup lang="ts">
import RealtimeSensorPanel from '~/features/realtime/RealtimeSensorPanel.vue'
import RealtimeStatusCards from '~/features/realtime/RealtimeStatusCards.vue'
import HydraulicDiagnosisPanel from '~/features/realtime/HydraulicDiagnosisPanel.vue'
import RealtimeTrendsPanel from '~/features/realtime/RealtimeTrendsPanel.vue'
import WaterFlowMetricsPanel from '~/features/realtime/WaterFlowMetricsPanel.vue'
import { useAutomation } from '~/features/control/use-automation'
import { useRealtimeSocket } from '~/features/realtime/use-realtime-socket'
import { useRealtimeTrends } from '~/features/realtime/use-realtime-trends'

const selectedDevice = ref('')
const {
  connectionGeneration,
  devicePresence,
  hydraulicDiagnoses,
  mqttConnected,
  readings,
  realtimeDetailPoints,
  socketStatus,
  trendPoints,
} = useRealtimeSocket()

const {
  loading: metricsLoading,
  resetting: resettingWaterFlow,
  resetWaterFlow,
  snapshot: automation,
} = useAutomation(selectedDevice)

const {
  allTrend,
  chartType,
  changeWindowSize,
  errorMessage,
  flowEmptyDescription,
  flowTrend,
  initialize: initializeTrends,
  latestReading,
  loading: trendLoading,
  options: trendOptions,
  temperatureEmptyDescription,
  temperatureTrend,
  windowSize,
} = useRealtimeTrends(
  selectedDevice,
  trendPoints,
  realtimeDetailPoints,
  connectionGeneration,
)

const deviceNumbers = computed(() => [...new Set([
  ...trendOptions.value.deviceNumbers,
  ...Object.keys(readings.value),
])])
const realtimeReading = computed(() => readings.value[selectedDevice.value])
const currentReading = computed(() => (
  realtimeReading.value
  || latestReading.value
))

watch(deviceNumbers, (numbers) => {
  if (!numbers.includes(selectedDevice.value)) {
    selectedDevice.value = numbers[0] ?? ''
  }
}, { immediate: true })

onMounted(() => {
  void initializeTrends()
})
</script>

<template>
  <div class="mx-auto max-w-[1500px] space-y-5">
    <header class="flex items-end justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-slate-900">实时监控</h1>
        <p class="mt-2 mb-0 text-sm text-slate-500">
          查看 MQTT 设备最新上传的传感器数据
        </p>
      </div>
      <el-select
        v-model="selectedDevice"
        placeholder="等待设备数据"
        class="w-56"
        :disabled="deviceNumbers.length === 0"
      >
        <el-option
          v-for="deviceNumber in deviceNumbers"
          :key="deviceNumber"
          :label="deviceNumber"
          :value="deviceNumber"
        />
      </el-select>
    </header>

    <RealtimeStatusCards
      :mqtt-connected="mqttConnected"
      :socket-status="socketStatus"
      :latest-recorded-at="currentReading?.recordedAt"
      :device-status="devicePresence[selectedDevice]?.status"
      :data-kind="currentReading?.dataKind"
    />

    <RealtimeSensorPanel
      :device-number="selectedDevice"
      :fields="trendOptions.fields"
      :reading="currentReading"
      :realtime="Boolean(realtimeReading)"
    />

    <HydraulicDiagnosisPanel :diagnosis="hydraulicDiagnoses[selectedDevice]" />

    <WaterFlowMetricsPanel
      :snapshot="automation?.waterFlow"
      :loading="metricsLoading"
      :resetting="resettingWaterFlow"
      :disabled="!selectedDevice"
      @reset="resetWaterFlow"
    />

    <RealtimeTrendsPanel
      v-model:chart-type="chartType"
      v-model:window-size="windowSize"
      :all-trend="allTrend"
      :error-message="errorMessage"
      :flow-empty-description="flowEmptyDescription"
      :flow-trend="flowTrend"
      :loading="trendLoading"
      :temperature-empty-description="temperatureEmptyDescription"
      :temperature-trend="temperatureTrend"
      @change-window="changeWindowSize"
    />
  </div>
</template>
