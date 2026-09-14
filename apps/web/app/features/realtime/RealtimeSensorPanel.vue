<script setup lang="ts">
import type {
  SensorHistoryField,
  SensorRealtimeData,
} from '@new26interthing/shared'

const props = defineProps<{
  deviceNumber: string
  fields: SensorHistoryField[]
  reading?: SensorRealtimeData
  realtime: boolean
}>()

const fieldLabels = computed(() => new Map(
  props.fields.map(field => [field.key, field.label]),
))
</script>

<template>
  <section class="min-h-80 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
    <div class="mb-5 flex items-center justify-between">
      <div>
        <h2 class="m-0 text-lg font-semibold text-slate-900">传感器数据</h2>
        <p class="mt-1 mb-0 text-sm text-slate-500">
          设备编号：{{ deviceNumber || '--' }}
        </p>
      </div>
      <el-tag v-if="reading" type="success" effect="light">
        {{ reading.dataKind === 'backfill' ? '断网补发 (1)' : realtime ? '正常联网 (0)' : '最近实时记录' }}
      </el-tag>
    </div>

    <div
      v-if="reading && Object.keys(reading.fields).length"
      class="grid grid-cols-4 gap-4"
    >
      <div
        v-for="(value, name) in reading.fields"
        :key="name"
        class="rounded-lg bg-slate-50 p-5"
      >
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
</template>
