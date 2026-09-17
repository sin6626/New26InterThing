<script setup lang="ts">
import type { FaultRuleConfig } from '@new26interthing/shared'
import { ElMessage } from 'element-plus'
import { useControlApi } from '~/features/control/api'

const api = useControlApi()
const rows = ref<FaultRuleConfig[]>([])
const loading = ref(false)
const saving = ref('')
const labels = { safety: '核心安全', diagnostic: '诊断规则', communication: '通信状态' }

const load = async () => {
  loading.value = true
  try {
    rows.value = await api.getFaultRules()
  }
  finally {
    loading.value = false
  }
}

const save = async (row: FaultRuleConfig) => {
  saving.value = row.faultCode
  try {
    const updated = await api.updateFaultRule(row.faultCode, row)
    Object.assign(row, updated)
    ElMessage.success('告警配置已更新')
  }
  catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
    await load()
  }
  finally {
    saving.value = ''
  }
}

const saveRow = (row: unknown) => save(row as FaultRuleConfig)

onMounted(() => void load())
</script>

<template>
  <div class="mx-auto max-w-[1500px] space-y-4">
    <div>
      <h1 class="m-0 text-2xl font-semibold">告警配置</h1>
      <p class="mt-2 text-sm text-slate-500">
        比赛现场按故障码分别控制规则、记录和弹窗；所有规则都可以关闭
      </p>
    </div>
    <el-alert
      title="关闭规则/保护后，该故障不再触发保护、记录和弹窗；连接真实设备时请谨慎关闭安全规则。"
      type="warning"
      show-icon
      :closable="false"
    />
    <el-card shadow="never">
      <el-table v-loading="loading" :data="rows">
        <el-table-column prop="name" label="告警名称" min-width="180" />
        <el-table-column prop="faultCode" label="故障码" min-width="220" />
        <el-table-column label="分类" width="110">
          <template #default="{ row }">
            {{ labels[row.category as keyof typeof labels] }}
          </template>
        </el-table-column>
        <el-table-column label="规则/保护" width="130">
          <template #default="{ row }">
            <el-switch
              v-model="row.protectionEnabled"
              :disabled="saving === row.faultCode"
              @change="saveRow(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="保存记录" width="110">
          <template #default="{ row }">
            <el-switch
              v-model="row.recordEnabled"
              :disabled="saving === row.faultCode"
              @change="saveRow(row)"
            />
          </template>
        </el-table-column>
        <el-table-column label="弹窗提醒" width="110">
          <template #default="{ row }">
            <el-switch
              v-model="row.notificationEnabled"
              :disabled="saving === row.faultCode"
              @change="saveRow(row)"
            />
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>
