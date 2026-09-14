<script setup lang="ts">
defineProps<{
  dataKind?: 'realtime' | 'backfill'
  deviceStatus?: 'online' | 'offline'
  latestRecordedAt?: string
  mqttConnected: boolean
  socketStatus: 'connecting' | 'connected' | 'disconnected'
}>()

const socketLabels = {
  connecting: '连接中',
  connected: '已连接',
  disconnected: '已断开',
} as const
</script>

<template>
  <div class="grid grid-cols-5 gap-4">
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="m-0 text-sm text-slate-500">MQTT 服务</p>
      <p
        class="mt-3 mb-0 text-lg font-semibold"
        :class="mqttConnected ? 'text-emerald-600' : 'text-slate-400'"
      >
        {{ mqttConnected ? '已连接' : '未连接' }}
      </p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="m-0 text-sm text-slate-500">实时通道</p>
      <p
        class="mt-3 mb-0 text-lg font-semibold"
        :class="socketStatus === 'connected' ? 'text-emerald-600' : 'text-amber-500'"
      >
        {{ socketLabels[socketStatus] }}
      </p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="m-0 text-sm text-slate-500">设备状态</p>
      <p
        class="mt-3 mb-0 text-lg font-semibold"
        :class="deviceStatus === 'online' ? 'text-emerald-600' : 'text-slate-400'"
      >
        {{ deviceStatus === 'online' ? '在线' : '离线' }}
      </p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="m-0 text-sm text-slate-500">数据类型</p>
      <p class="mt-3 mb-0 text-lg font-semibold text-slate-800">
        {{ dataKind === 'backfill' ? '断网补发 (1)' : dataKind === 'realtime' ? '正常联网 (0)' : '--' }}
      </p>
    </div>
    <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p class="m-0 text-sm text-slate-500">最新数据时间</p>
      <p class="mt-3 mb-0 text-lg font-semibold text-slate-800">
        {{ latestRecordedAt || '--' }}
      </p>
    </div>
  </div>
</template>
