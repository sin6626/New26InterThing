<script setup lang="ts">
import FaultStatisticsChart from '~/features/fault/FaultStatisticsChart.vue'
import { useFaults } from '~/features/fault/use-faults'

const {
  endTime, errorMessage, filters, initialize, loadCurrentPage, loading,
  options, page, reset, rows, search, startTime, statistics, total,
} = useFaults()

onMounted(() => void initialize())
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-4">
    <div>
      <h1 class="m-0 text-2xl font-semibold text-slate-900">故障信息</h1>
      <p class="mt-2 mb-0 text-sm text-slate-500">查询设备主动上报并已保存的故障记录</p>
    </div>

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <el-form :inline="true" class="flex flex-wrap items-center gap-y-3">
        <el-form-item label="设备" class="mb-0">
          <el-select v-model="filters.deviceNumber" clearable placeholder="全部设备" style="width: 190px">
            <el-option v-for="number in options.deviceNumbers" :key="number" :label="number" :value="number" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型" class="mb-0">
          <el-select v-model="filters.type" clearable placeholder="全部类型" style="width: 140px">
            <el-option v-for="item in options.types" :key="item.value" :label="item.label" :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="开始时间" class="mb-0">
          <el-date-picker v-model="startTime" type="datetime" placeholder="不限" format="YYYY-MM-DD HH:mm:ss" style="width: 190px" />
        </el-form-item>
        <el-form-item label="结束时间" class="mb-0">
          <el-date-picker v-model="endTime" type="datetime" placeholder="不限" format="YYYY-MM-DD HH:mm:ss" style="width: 190px" />
        </el-form-item>
        <el-form-item class="mb-0">
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-800">故障记录</span>
          <span class="text-sm text-slate-500">共 {{ total }} 条</span>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe>
        <el-table-column type="index" label="序号" width="70" />
        <el-table-column prop="deviceNumber" label="设备编号" min-width="170" />
        <el-table-column prop="errorNumber" label="故障编号" min-width="130" />
        <el-table-column label="类型" width="110">
          <template #default="scope">
            <el-tag type="danger" effect="plain">{{ scope.row.type ? `类型 ${scope.row.type}` : '未知类型' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="故障信息" min-width="320" show-overflow-tooltip />
        <el-table-column prop="occurredAt" label="发生时间" width="180" />
        <template #empty><el-empty description="暂无故障信息" /></template>
      </el-table>
      <div class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="page.current"
          v-model:page-size="page.size"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadCurrentPage"
          @size-change="search"
        />
      </div>
    </el-card>

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header><span class="font-medium text-slate-800">故障类型统计</span></template>
      <FaultStatisticsChart :items="statistics" />
    </el-card>
  </div>
</template>
