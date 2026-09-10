<script setup lang="ts">
import type { Device } from '@new26interthing/shared'
import { ElMessage } from 'element-plus'

import { useDeviceApi } from '~/features/device/api'

const api = useDeviceApi()
const loading = ref(false)
const devices = ref<Device[]>([])
const total = ref(0)
const filters = reactive({ number: '', deviceName: '' })
const query = reactive({ page: 1, pageSize: 20 })

const loadDevices = async () => {
  loading.value = true
  try {
    const result = await api.listDevices({
      ...query,
      number: filters.number.trim() || undefined,
      deviceName: filters.deviceName.trim() || undefined,
    })
    devices.value = result.items
    total.value = result.total
  } catch {
    ElMessage.error('设备列表加载失败，请检查后端和数据库连接')
  } finally {
    loading.value = false
  }
}

const search = () => {
  query.page = 1
  void loadDevices()
}

const reset = () => {
  filters.number = ''
  filters.deviceName = ''
  query.page = 1
  void loadDevices()
}

onMounted(() => {
  void loadDevices()
})
</script>

<template>
  <div class="mx-auto max-w-[1600px]">
    <div class="mb-5">
      <h1 class="m-0 text-2xl font-semibold text-slate-900">设备管理</h1>
      <p class="mt-2 mb-0 text-sm text-slate-500">查询已在项目数据库中登记的设备</p>
    </div>

    <el-card shadow="never" class="mb-4 rounded-xl border-slate-200">
      <el-form :inline="true" :model="filters" class="flex flex-wrap items-center gap-y-3">
        <el-form-item label="设备编号" class="mb-0">
          <el-input v-model="filters.number" clearable placeholder="输入编号" @keyup.enter="search" />
        </el-form-item>
        <el-form-item label="设备名称" class="mb-0">
          <el-input v-model="filters.deviceName" clearable placeholder="输入名称" @keyup.enter="search" />
        </el-form-item>
        <el-form-item class="mb-0">
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-800">设备列表</span>
          <span class="text-sm text-slate-500">共 {{ total }} 台</span>
        </div>
      </template>

      <el-table v-loading="loading" :data="devices" stripe table-layout="fixed">
        <el-table-column prop="number" label="设备编号" min-width="160" />
        <el-table-column prop="deviceName" label="设备名称" min-width="220" />
        <el-table-column prop="remarks" label="备注" min-width="260" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" width="190" />
        <template #empty>
          <el-empty description="暂无设备数据" />
        </template>
      </el-table>

      <div class="mt-5 flex justify-end">
        <el-pagination
          v-model:current-page="query.page"
          v-model:page-size="query.pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @current-change="loadDevices"
          @size-change="search"
        />
      </div>
    </el-card>
  </div>
</template>
