<script setup lang="ts">
const route = useRoute()

const menuGroups = [
  {
    title: '监控中心',
    items: ['实时监控', '历史数据', '行为数据', '故障信息'],
  },
  {
    title: '设备与控制',
    items: ['设备管理', '指令控制', '操作日志'],
  },
]
</script>

<template>
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
          <template v-for="item in group.items" :key="item">
            <NuxtLink
              v-if="item === '设备管理'"
              to="/device"
              class="mb-1 block rounded-lg px-3 py-2.5 text-sm no-underline transition-colors"
              :class="route.path.startsWith('/device') ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-900'"
            >
              {{ item }}
            </NuxtLink>
            <div v-else class="mb-1 rounded-lg px-3 py-2.5 text-sm text-slate-600">
              {{ item }}
            </div>
          </template>
        </section>
      </nav>
    </el-aside>

    <el-container>
      <el-header height="64px" class="flex items-center justify-between border-b border-slate-200 bg-white px-6">
        <span class="text-sm text-slate-500">水循环物联网应用系统</span>
        <el-tag type="info" effect="plain">第一阶段</el-tag>
      </el-header>
      <el-main class="p-6">
        <slot />
      </el-main>
    </el-container>
  </el-container>
</template>
