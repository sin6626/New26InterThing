<script setup lang="ts">
import HistoryTrendChart from '~/features/sensor-history/HistoryTrendChart.vue'
import HistoricalOperationalMetricsPanel from '~/features/sensor-history/HistoricalOperationalMetricsPanel.vue'
import { useSensorHistory } from '~/features/sensor-history/use-sensor-history'

const {
  chartType, changeTrendLimit, errorMessage, fieldValue, filters, initialize,
  loadCurrentPage, loading, options, page, reset, rows, search, timeRange,
  total, trend, trendLimit,
  operationalMetrics, operationalMetricsError, operationalMetricsLoading,
  recognize, recognizing, updateSelection,
} = useSensorHistory()

onMounted(() => void initialize())

const isBackfill = (value: unknown) => String(value) === '1' || value === '保存数据'
</script>

<template>
  <div class="mx-auto max-w-[1600px] space-y-4">
    <div>
      <h1 class="m-0 text-2xl font-semibold text-slate-900">历史数据</h1>
      <p class="mt-2 mb-0 text-sm text-slate-500">按设备和时间查询传感器记录及变化趋势</p>
    </div>

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <el-form :inline="true" class="flex flex-wrap items-center gap-y-3">
        <!-- 因为现在应该只有一个设备所以隐藏掉 -->
        <el-form-item v-if="false" label="设备" class="mb-0">
          <el-select v-model="filters.deviceNumber" clearable placeholder="全部设备" style="width: 210px">
            <el-option v-for="number in options.deviceNumbers" :key="number" :label="number" :value="number" />
          </el-select>
        </el-form-item>
        <!-- todo: 这里不应该使用时间日期选择器, 他这个组件必须选择开始和结束时间, 但是实际上应该只选一个时间也要支持, 这里得要换个组件 -->
        <el-form-item label="时间范围" class="mb-0">
          <el-date-picker
            v-model="timeRange"
            type="datetimerange"
            start-placeholder="开始时间"
            end-placeholder="结束时间"
            format="YYYY-MM-DD HH:mm:ss"
            class="w-96"
          />
        </el-form-item>
        <el-form-item label="状态" class="mb-0">
          <el-select v-model="filters.status" style="width: 140px">
            <el-option label="全部数据" value="all" />
            <el-option label="正常" value="normal" />
            <el-option label="告警" value="abnormal" />
          </el-select>
        </el-form-item>
        <el-form-item class="mb-0">
          <el-button type="primary" :loading="loading" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-alert v-if="errorMessage" :title="errorMessage" type="error" show-icon :closable="false" />

    <HistoricalOperationalMetricsPanel
      :loading="operationalMetricsLoading"
      :error-message="operationalMetricsError"
      :metrics="operationalMetrics"
      :has-time-range="Boolean(timeRange)"
    />

    <el-card shadow="never" class="rounded-xl border-slate-200">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-medium text-slate-800">历史记录</span>
          <div class="flex items-center gap-3"><el-button type="primary" :loading="recognizing" @click="recognize">智能识别</el-button><span class="text-sm text-slate-500">共 {{ total }} 条</span></div>
        </div>
      </template>
      <el-table v-loading="loading" :data="rows" stripe @selection-change="updateSelection">
        <el-table-column type="selection" width="48" />
        <el-table-column type="index" label="序号" width="70" />
        <el-table-column prop="deviceNumber" label="设备编号" min-width="180" />
        <el-table-column v-for="field in options.fields" :key="field.key" :label="`${field.label}${field.unit ? ` (${field.unit})` : ''}`" min-width="130">
          <template #default="scope">{{ fieldValue(scope.row, field) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'normal' ? 'success' : 'danger'" size="small">
              {{ scope.row.status === 'normal' ? '正常' : '告警' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="数据类型" width="140">
          <template #default="scope">
            <el-tag :type="isBackfill(scope.row.online) ? 'warning' : 'success'" size="small">
              {{ isBackfill(scope.row.online) ? '断网补发 (1)' : '正常联网 (0)' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="recordedAt" label="采集时间" width="180" />
        <template #empty><el-empty description="暂无历史数据" /></template>
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
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <span class="font-medium text-slate-800">传感器历史趋势</span>
          <div class="flex gap-3">
            <el-select v-model="trendLimit" style="width: 130px" @change="changeTrendLimit">
              <el-option label="最近 10 点" :value="10" />
              <el-option label="最近 30 点" :value="30" />
              <el-option label="最近 60 点" :value="60" />
              <el-option label="最近 120 点" :value="120" />
            </el-select>
            <el-select v-model="chartType" style="width: 110px">
              <el-option label="折线图" value="line" />
              <el-option label="柱状图" value="bar" />
              <el-option label="散点图" value="scatter" />
            </el-select>
          </div>
        </div>
      </template>
      <HistoryTrendChart :times="trend.times" :series="trend.series" :chart-type="chartType" />
    </el-card>
  </div>
</template>
