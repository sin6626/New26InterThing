<script setup lang="ts">
import type { ControlField } from '@new26interthing/shared'

import { useControls } from '~/features/control/use-controls'

const {
  deviceNumbers,
  errorMessage,
  initialize,
  loading,
  savingId,
  selectedDevice,
  syncingTime,
  syncTime,
  update,
  visibleFields,
} = useControls()

const switchValue = (field: ControlField) => field.value === 'on'

const updateTime = (
  field: ControlField,
  value: unknown,
) => {
  if (typeof value === 'string' && value) {
    void update(field, value)
  }
}

const updateCheckbox = (
  field: ControlField,
  value: unknown,
) => {
  if (Array.isArray(value)) {
    void update(field, value.map(String))
  }
}

onMounted(() => void initialize())
</script>

<template>
  <div class="mx-auto max-w-[1500px] space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-slate-900">指令控制</h1>
        <p class="mt-2 mb-0 text-sm text-slate-500">
          提交人工操作意图；发布成功表示 Broker 已接收，不代表设备已执行
        </p>
      </div>
      <div class="flex gap-3">
        <el-button
          :loading="syncingTime"
          :disabled="!selectedDevice"
          @click="syncTime"
        >
          同步当前时间
        </el-button>
        <el-select v-model="selectedDevice" placeholder="选择设备" style="width: 240px">
          <el-option v-for="number in deviceNumbers" :key="number" :label="number" :value="number" />
        </el-select>
      </div>
    </div>

    <el-alert
      v-if="errorMessage"
      :title="errorMessage"
      type="error"
      show-icon
      :closable="false"
    />
    <el-alert
      title="安全保护完成前，禁止人工开启加热和启动自动模式；关闭指令始终可用。"
      type="warning"
      show-icon
      :closable="false"
    />

    <el-card v-loading="loading" shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">设备控制配置</span>
          <span class="text-sm text-slate-500">设备：{{ selectedDevice || '--' }}</span>
        </div>
      </template>

      <div class="grid grid-cols-2 gap-4">
        <div
          v-for="field in visibleFields"
          :key="field.configId"
          class="rounded-lg border border-slate-200 p-4"
        >
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <p class="m-0 font-medium text-slate-800">{{ field.name }}</p>
              <p class="mt-1 mb-0 text-xs text-slate-400">
                {{ field.topic }} · 配置 {{ field.configId }}
              </p>
            </div>
            <el-tag effect="plain">当前：{{ field.value ?? '--' }}</el-tag>
          </div>

          <el-switch
            v-if="field.type === 'switch'"
            :model-value="switchValue(field)"
            :loading="savingId === field.configId"
            :disabled="savingId !== undefined
              || (field.heaterStartBlocked && field.value !== 'on')
              || (field.automaticStartBlocked && field.value !== 'on')"
            active-text="开启"
            inactive-text="关闭"
            @change="value => update(field, Boolean(value))"
          />
          <div v-else-if="field.type === 'input'" class="flex gap-2">
            <el-input
              :model-value="field.value ?? ''"
              placeholder="请输入配置值"
              class="flex-1"
              @change="value => update(field, value)"
            />
          </div>
          <el-slider
            v-else-if="field.type === 'slider'"
            :model-value="Number(field.value || 0)"
            :min="field.min ?? 0"
            :max="field.max ?? 100"
            @change="value => update(field, Number(value))"
          />
          <el-select
            v-else-if="field.type === 'radio'"
            :model-value="field.value"
            @change="value => update(field, value)"
          >
            <el-option
              v-for="option in field.options"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
          <el-time-picker
            v-else-if="field.type === 'time'"
            :model-value="field.value"
            value-format="HH:mm:ss"
            placeholder="选择时间"
            @change="updateTime(field, $event)"
          />
          <el-checkbox-group
            v-else-if="field.type === 'checkbox'"
            :model-value="field.value ? field.value.split(',') : []"
            @change="updateCheckbox(field, $event)"
          >
            <el-checkbox
              v-for="option in field.options"
              :key="option.value"
              :label="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </el-checkbox>
          </el-checkbox-group>
          <el-alert v-else title="暂不支持的控件类型" type="info" :closable="false" />
        </div>
      </div>
      <el-empty v-if="!loading && !visibleFields.length" description="暂无控制配置" />
    </el-card>
  </div>
</template>
