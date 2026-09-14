<script setup lang="ts">
import type { HydraulicDiagnosis } from '@new26interthing/shared'

defineProps<{ diagnosis?: HydraulicDiagnosis }>()

const tagType = (level?: HydraulicDiagnosis['level']) => ({
  success: 'success',
  warning: 'warning',
  error: 'danger',
  info: 'info',
}[level || 'info'] as 'success' | 'warning' | 'danger' | 'info')
</script>

<template>
  <el-card shadow="never" class="rounded-xl border-slate-200">
    <template #header>
      <div class="flex items-center justify-between">
        <span class="font-medium text-slate-800">水力联合诊断</span>
        <el-tag :type="tagType(diagnosis?.level)">
          {{ diagnosis?.name || '等待实时数据' }}
        </el-tag>
      </div>
    </template>
    <p class="m-0 text-sm text-slate-600">
      {{ diagnosis?.detail || '收到设备实时数据后开始诊断；断网补发数据不会参与控制或诊断。' }}
    </p>
  </el-card>
</template>
