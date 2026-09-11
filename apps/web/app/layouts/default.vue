<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'

const route = useRoute()

const menuGroups = [
  {
    title: '监控中心',
    items: [
      { label: '实时监控', to: '/' },
      { label: '历史数据', to: '/history' },
      { label: '行为数据' },
      { label: '故障信息' },
    ],
  },
  {
    title: '设备与控制',
    items: [
      { label: '设备管理', to: '/device' },
      { label: '指令控制' },
      { label: '操作日志' },
    ],
  },
]

function isActive(to: string) {
  return to === '/' ? route.path === '/' : route.path.startsWith(to)
}
</script>

<template>
  <el-config-provider :locale="zhCn">
  <el-container class="min-h-screen bg-[#f3f5f8]">
    <el-aside width="220px" class="border-r border-slate-200 bg-slate-950 text-white">
      <div class="flex h-16 items-center border-b border-slate-800 px-5">
        <div>
          <p class="m-0 text-base font-semibold tracking-wide">物联网控制平台</p>
          <p class="mt-1 mb-0 text-xs text-slate-400">New26InterThing</p>
        </div>
      </div>

      <nav class="px-3 py-4">
        <section v-for="group in menuGroups" :key="group.title" class="mb-6">
          <p class="mb-2 px-3 text-xs font-medium tracking-widest text-slate-500">
            {{ group.title }}
          </p>
          <template v-for="item in group.items" :key="item.label">
            <NuxtLink
              v-if="item.to"
              :to="item.to"
              class="mb-1 block rounded-lg px-3 py-2.5 text-sm no-underline transition-colors"
              :class="isActive(item.to) ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-900'"
            >
              {{ item.label }}
            </NuxtLink>
            <div v-else class="mb-1 rounded-lg px-3 py-2.5 text-sm text-slate-600">
              {{ item.label }}
            </div>
          </template>
        </section>
      </nav>
    </el-aside>

    <el-container>
      <el-header height="64px" class="flex items-center justify-between border-b border-slate-200 bg-white px-6">
        <span class="text-sm text-slate-500">水循环物联网应用系统</span>
        <el-tag type="info" effect="plain">第三里程碑</el-tag>
      </el-header>
      <el-main class="p-6">
        <slot />
      </el-main>
    </el-container>
  </el-container>
  </el-config-provider>
</template>
