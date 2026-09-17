<script setup lang="ts">
import type { ControlField } from '@new26interthing/shared'

import { useControls } from '~/features/control/use-controls'
import { useAutomation } from '~/features/control/use-automation'
import WaterFlowMetricsPanel from '~/features/realtime/WaterFlowMetricsPanel.vue'

const {
  controlTree,
  deviceNumbers,
  errorMessage,
  initialize,
  loading,
  savingId,
  selectedDevice,
  syncingTime,
  syncTime,
  update,
} = useControls()

const {
  loading: automationLoading,
  operationalMetrics,
  resetting: resettingWaterFlow,
  resettingOperationalMetrics,
  resettingFault,
  resetFault,
  resetWaterFlow,
  resetOperationalMetrics,
  snapshot: automation,
} = useAutomation(selectedDevice)

const stateLabels = {
  stopped: '已停止',
  'building-flow': '正在建流',
  running: '自动运行',
  cooling: '正在冷却',
  fault: '故障锁定',
}

const sensorStatusLabels = {
  unknown: '未知',
  ok: '正常',
  invalid: '无效',
  timeout: '超时',
}

const automationStateTagType = computed(() => {
  if (automation.value?.safety.locked) return 'danger'
  return automation.value?.enabled ? 'success' : 'info'
})

const faultRecordStatus = computed(() => {
  if (automation.value?.safety.faultRecorded) return '已入库并告警'
  return automation.value?.safety.faultRecordError || '等待记录'
})

const faultOccurredAt = computed(() => {
  const occurredAt = automation.value?.safety.occurredAt
  return occurredAt ? new Date(occurredAt).toLocaleString('zh-CN') : '--'
})

const switchValue = (field: ControlField) => field.value === 'on'

const updateDateTime = (
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

const inputDrafts = ref<Record<number, string>>({})
const focusedConfigId = ref<number>()

const getInputValue = (field: ControlField) => {
  if (focusedConfigId.value === field.configId && inputDrafts.value[field.configId] !== undefined) {
    return inputDrafts.value[field.configId]
  }
  return field.value ?? ''
}

const onInputFocus = (field: ControlField) => {
  focusedConfigId.value = field.configId
  inputDrafts.value[field.configId] = field.value ?? ''
}

const onInputUpdate = (field: ControlField, value: string) => {
  inputDrafts.value[field.configId] = value
}

const onInputCommit = (field: ControlField) => {
  const draft = inputDrafts.value[field.configId]
  focusedConfigId.value = undefined
  if (draft !== undefined && draft !== (field.value ?? '')) {
    void update(field, draft)
  }
  delete inputDrafts.value[field.configId]
}

onMounted(() => void initialize())
</script>

<template>
  <div class="mx-auto max-w-[1500px] space-y-4">
    <div class="flex items-end justify-between gap-4">
      <div>
        <h1 class="m-0 text-2xl font-semibold text-slate-900">指令控制</h1>
        <p class="mt-2 mb-0 text-sm text-slate-500">
          运行指令按配置发布到设备；控制参数仅保存，供自动状态机判断
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
      :title="automation?.safety.locked
        ? `安全故障已锁定：${automation.safety.detail}`
        : '加热、水泵和自动模式均由后端统一安全门持续保护。'"
      :type="automation?.safety.locked ? 'error' : 'success'"
      show-icon
      :closable="false"
    />

    <el-card
      v-loading="automationLoading"
      shadow="never"
      class="rounded-xl border-slate-200"
    >
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">自动水循环状态</span>
          <div class="flex items-center gap-2">
            <el-button
              v-if="automation?.safety.locked"
              type="danger"
              plain
              :loading="resettingFault"
              @click="resetFault"
            >
              确认并复位
            </el-button>
            <el-tag :type="automationStateTagType">
              {{ automation ? stateLabels[automation.state] : '--' }}
            </el-tag>
          </div>
        </div>
      </template>
      <el-descriptions :column="4" border>
        <el-descriptions-item label="控温策略">
          {{ automation?.temperatureStrategy ?? '--' }}
        </el-descriptions-item>
        <el-descriptions-item label="目标温度">
          {{ automation?.targetTemperature ?? '--' }} ℃
        </el-descriptions-item>
        <el-descriptions-item label="水泵状态">
          实际 {{ automation?.actualPump ?? '--' }} / 期望 {{ automation?.desiredPump ?? '--' }}
        </el-descriptions-item>
        <el-descriptions-item label="加热状态">
          实际 {{ automation?.actualHeater ?? '--' }} / 期望 {{ automation?.desiredHeater ?? '--' }}
        </el-descriptions-item>
        <el-descriptions-item label="出口温度">
          {{ automation?.outletTemperature ?? '--' }} ℃
        </el-descriptions-item>
        <el-descriptions-item label="倒计时">
          {{ automation?.countdownSeconds ?? '--' }} 秒
        </el-descriptions-item>
        <el-descriptions-item label="PID 输出">
          {{ automation?.pid?.outputPercent ?? '--' }} %
        </el-descriptions-item>
        <el-descriptions-item label="计划占空比">
          {{ automation?.pid?.plannedDutyPercent ?? '--' }} %
        </el-descriptions-item>
        <el-descriptions-item label="PID 窗口剩余">
          {{ automation?.pid?.windowRemainingSeconds ?? '--' }} 秒
        </el-descriptions-item>
        <el-descriptions-item label="最近动作">
          <template v-if="automation?.lastAction">
            {{ automation.lastAction.topic }}={{ automation.lastAction.value }}；
            {{ automation.lastAction.message }}
          </template>
          <template v-else>--</template>
        </el-descriptions-item>
        <el-descriptions-item label="故障码">
          {{ automation?.safety.faultCode ?? '--' }}
        </el-descriptions-item>
        <el-descriptions-item label="故障发生时间">
          {{ faultOccurredAt }}
        </el-descriptions-item>
        <el-descriptions-item label="故障记录">
          <template v-if="automation?.safety.locked">
            {{ faultRecordStatus }}
          </template>
          <template v-else>--</template>
        </el-descriptions-item>
        <el-descriptions-item label="保护动作">
          <template v-if="automation?.safety.protection">
            关热：{{ automation.safety.protection.closeHeater ? '是' : '否' }}；
            停泵：{{ automation.safety.protection.stopPump ? '是' : '延时散热' }}
          </template>
          <template v-else>--</template>
        </el-descriptions-item>
        <el-descriptions-item label="流量传感器">
          {{ automation ? sensorStatusLabels[automation.safety.sensors.flow] : '--' }}
        </el-descriptions-item>
        <el-descriptions-item label="压力传感器">
          {{ automation ? sensorStatusLabels[automation.safety.sensors.pressure] : '--' }}
        </el-descriptions-item>
        <el-descriptions-item label="入口温度传感器">
          {{ automation ? sensorStatusLabels[automation.safety.sensors.inletTemperature] : '--' }}
        </el-descriptions-item>
        <el-descriptions-item label="出口温度传感器">
          {{ automation ? sensorStatusLabels[automation.safety.sensors.outletTemperature] : '--' }}
        </el-descriptions-item>
      </el-descriptions>
      <p v-if="automation?.limitationReason" class="mb-0 text-sm text-amber-600">
        当前限制：{{ automation.limitationReason }}
      </p>
      <p v-if="automation?.safety.locked && !automation.safety.resetAllowed" class="mb-0 text-sm text-red-600">
        暂不可复位：{{ automation.safety.resetReason }}
      </p>
    </el-card>

    <WaterFlowMetricsPanel
      :snapshot="automation?.waterFlow"
      :operational-metrics="operationalMetrics"
      :loading="automationLoading"
      :resetting="resettingWaterFlow"
      :runtime-resetting="resettingOperationalMetrics"
      :disabled="!selectedDevice"
      @reset="resetWaterFlow"
      @reset-runtime="resetOperationalMetrics"
    />

    <el-card v-loading="loading" shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium">设备控制配置</span>
          <span class="text-sm text-slate-500">设备：{{ selectedDevice || '--' }}</span>
        </div>
      </template>

      <el-tree
        :data="controlTree"
        node-key="configId"
        default-expand-all
        :expand-on-click-node="false"
        :indent="28"
        class="control-tree"
      >
        <template #default="{ data: field }">
          <div class="control-node">
            <div>
              <p class="m-0 font-medium text-slate-800">{{ field.name }}</p>
              <p class="mt-1 mb-0 text-xs text-slate-400">
                {{ field.topic }} · 配置 {{ field.configId }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <el-tag
                :type="field.actionKind === 'command' ? 'warning' : 'info'"
                effect="plain"
              >
                {{ field.actionKind === 'command' ? '运行指令' : '控制参数' }}
              </el-tag>
              <el-tag effect="plain">
                当前：{{ field.value ?? '--' }}
              </el-tag>
            </div>
            <div class="control-node__editor" @click.stop>
              <el-switch
                v-if="field.type === 'switch'"
                :model-value="switchValue(field)"
                :loading="savingId === field.configId"
                :disabled="savingId !== undefined"
                active-text="开启"
                inactive-text="关闭"
                @change="value => update(field, Boolean(value))"
              />
              <el-input
                v-else-if="field.type === 'input'"
                :model-value="getInputValue(field)"
                :disabled="savingId !== undefined"
                placeholder="请输入配置值"
                @focus="onInputFocus(field)"
                @input="value => onInputUpdate(field, String(value))"
                @keydown.enter.prevent="onInputCommit(field)"
                @blur="onInputCommit(field)"
              />
              <el-slider
                v-else-if="field.type === 'slider'"
                :model-value="Number(field.value || 0)"
                :min="field.min ?? 0"
                :max="field.max ?? 100"
                :disabled="savingId !== undefined"
                @change="value => update(field, Number(value))"
              />
              <el-select
                v-else-if="field.type === 'radio'"
                :model-value="field.value"
                :disabled="savingId !== undefined"
                @change="value => update(field, value)"
              >
                <el-option
                  v-for="option in field.options"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-date-picker
                v-else-if="field.type === 'datetime'"
                :model-value="field.value"
                :disabled="savingId !== undefined"
                type="datetime"
                value-format="YYYY-MM-DD HH:mm:ss"
                placeholder="选择日期时间"
                @change="updateDateTime(field, $event)"
              />
              <el-checkbox-group
                v-else-if="field.type === 'checkbox'"
                :model-value="field.value ? field.value.split(',') : []"
                :disabled="savingId !== undefined"
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
              <el-alert
                v-else
                title="暂不支持的控件类型"
                type="info"
                :closable="false"
              />
            </div>
          </div>
        </template>
      </el-tree>
      <el-empty
        v-if="!loading && !controlTree.length"
        description="暂无控制配置"
      />
    </el-card>
  </div>
</template>

<style scoped>
.control-tree {
  --el-tree-node-hover-bg-color: transparent;
}

.control-tree :deep(.el-tree-node__content) {
  height: auto;
  min-height: 86px;
  margin-bottom: 12px;
  padding-right: 16px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
}

.control-tree :deep(.el-tree-node__expand-icon) {
  margin-left: 10px;
}

.control-node {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto minmax(260px, 420px);
  align-items: center;
  width: 100%;
  gap: 20px;
  padding: 14px 0;
}

.control-node__editor {
  width: 100%;
}

@media (max-width: 1450px) {
  .control-node {
    grid-template-columns: minmax(190px, 1fr) auto minmax(220px, 320px);
    gap: 12px;
  }
}
</style>
