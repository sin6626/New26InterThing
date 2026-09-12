<script setup lang="ts">
import { useBehaviors } from '~/features/behavior/use-behaviors'

const { errorMessage, fieldValue, initialize, loadCurrentPage, loading, options, page, reset, rows, search, timeRange, total } = useBehaviors()
onMounted(() => void initialize())
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-4">
    <div><h1 class="m-0 text-2xl font-semibold text-slate-900">行为数据</h1><p class="mt-2 mb-0 text-sm text-slate-500">展示历史传感器数据经过智能识别后保存的结果</p></div>
    <el-card shadow="never" class="rounded-xl border-slate-200">
      <el-form :inline="true" class="flex flex-wrap items-center gap-y-3">
        <el-form-item label="识别时间" class="mb-0"><el-date-picker v-model="timeRange" type="datetimerange" start-placeholder="开始时间" end-placeholder="结束时间" format="YYYY-MM-DD HH:mm:ss" class="w-96" /></el-form-item>
        <el-form-item class="mb-0"><el-button type="primary" :loading="loading" @click="search">查询</el-button><el-button @click="reset">重置</el-button></el-form-item>
      </el-form>
    </el-card>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />
    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header><div class="flex items-center justify-between"><span class="font-medium text-slate-800">智能识别结果</span><span class="text-sm text-slate-500">共 {{ total }} 条</span></div></template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column type="index" label="序号" width="70" />
        <el-table-column v-for="field in options.fields" :key="field.key" :label="`${field.label}${field.unit ? ` (${field.unit})` : ''}`" min-width="140"><template #default="scope">{{ fieldValue(scope.row, field) }}</template></el-table-column>
        <el-table-column prop="recordedAt" label="识别时间" width="180" />
        <template #empty><el-empty description="暂无智能识别结果，请先在历史数据页选择记录并发起识别" /></template>
      </el-table>
      <div class="mt-5 flex justify-end"><el-pagination v-model:current-page="page.current" v-model:page-size="page.size" :page-sizes="[10, 20, 50, 100]" :total="total" layout="total, sizes, prev, pager, next, jumper" @current-change="loadCurrentPage" @size-change="search" /></div>
    </el-card>
  </div>
</template>
