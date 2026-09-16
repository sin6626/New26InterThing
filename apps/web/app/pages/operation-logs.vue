<script setup lang="ts">
import { useOperationLogs } from '~/features/control/use-operation-logs'

const {
  errorMessage,
  filters,
  initialize,
  load,
  loading,
  options,
  page,
  reset,
  rows,
  timeRange,
  total,
} = useOperationLogs()

onMounted(() => void initialize())
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-4">
    <div>
      <h1 class="m-0 text-2xl font-semibold text-slate-900">操作历史</h1>
      <p class="mt-2 mb-0 text-sm text-slate-500">查询应用层、设备和智能识别操作记录</p>
    </div>
    <el-card shadow="never" class="rounded-xl border-slate-200">
      <el-form :inline="true" class="flex flex-wrap gap-y-3">
        <el-form-item label="设备" class="mb-0">
          <el-select
            v-model="filters.deviceNumber"
            clearable
            placeholder="全部设备"
            style="width: 190px"
          >
            <el-option
              v-for="item in options.deviceNumbers"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="来源" class="mb-0">
          <el-select v-model="filters.source" clearable placeholder="全部来源" style="width: 150px">
            <el-option label="应用层" value="application" />
            <el-option label="设备" value="device" />
            <el-option label="智能识别" value="recognition" />
          </el-select>
        </el-form-item>
        <el-form-item label="指令类型" class="mb-0">
          <el-select
            v-model="filters.commandType"
            clearable
            placeholder="全部类型"
            style="width: 180px"
          >
            <el-option
              v-for="item in options.commandTypes"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="结果" class="mb-0">
          <el-select
            v-model="filters.result"
            clearable
            placeholder="全部结果"
            style="width: 130px"
          >
            <el-option
              v-for="item in options.results"
              :key="item"
              :label="item"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="操作时间" class="mb-0">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            style="width: 360px"
          />
        </el-form-item>
        <el-form-item class="mb-0">
          <el-button
            type="primary"
            :loading="loading"
            @click="load(true)"
          >
            查询
          </el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />
    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex justify-between">
          <span>操作记录</span>
          <span class="text-sm text-slate-500">共 {{ total }} 条</span>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column prop="operatedAt" label="操作时间" width="180" />
        <el-table-column label="来源" width="120">
          <template #default="scope">
            {{ scope.row.source === 'device' ? '设备' : scope.row.source === 'recognition' ? '智能识别' : '应用层' }}
          </template>
        </el-table-column>
        <el-table-column prop="deviceNumber" label="设备编号" min-width="165" />
        <el-table-column prop="commandName" label="指令名称" min-width="170" />
        <el-table-column prop="commandType" label="指令类型" min-width="150" />
        <el-table-column prop="oldValue" label="原值" min-width="100" />
        <el-table-column prop="newValue" label="新值" min-width="100" />
        <el-table-column label="结果" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.result === 'success' ? 'success' : 'danger'">
              {{ scope.row.result }}
            </el-tag>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无操作日志" />
        </template>
      </el-table>
      <div class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="page.current"
          v-model:page-size="page.size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="load()"
          @size-change="load(true)"
        />
      </div>
    </el-card>
  </div>
</template>
