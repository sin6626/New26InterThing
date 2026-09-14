<script setup lang="ts">
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import {
  Promotion,
  Bell,
  Warning,
  ChatLineRound,
  Tickets,
  StarFilled,
} from '@element-plus/icons-vue'
import { useRealtimeSocket } from '~/features/realtime/use-realtime-socket'

const route = useRoute()
useRealtimeSocket()
</script>

<template>
  <el-config-provider :locale="zhCn">
    <el-container class="h-screen overflow-hidden bg-[#f3f5f8]">
      <el-aside width="220px" class="flex h-screen shrink-0 flex-col bg-[#232323] text-white">
        <div class="flex h-16 shrink-0 items-center border-b border-[#333] px-5">
          <div>
            <p class="m-0 text-base font-semibold tracking-wide text-white">物联网控制平台</p>
            <p class="mt-1 mb-0 text-xs text-slate-400">New26InterThing</p>
          </div>
        </div>

        <el-menu
          class="sidebar-menu flex-1 overflow-y-auto"
          :default-active="route.path"
          :default-openeds="['sensors']"
          background-color="#232323"
          text-color="#fff"
          active-text-color="#ffd04b"
          router
        >
          <el-sub-menu index="sensors">
            <template #title>
              <el-icon><Promotion /></el-icon>
              <span>传感器数据</span>
            </template>
            <el-menu-item index="/">
              <el-icon><Promotion /></el-icon>
              <span>实时数据</span>
            </el-menu-item>
            <el-menu-item index="/history">
              <el-icon><Promotion /></el-icon>
              <span>历史数据</span>
            </el-menu-item>
          </el-sub-menu>

          <el-menu-item index="/behaviors">
            <el-icon><Bell /></el-icon>
            <span>行为数据</span>
          </el-menu-item>

          <el-menu-item index="/faults">
            <el-icon><Warning /></el-icon>
            <span>错误信息</span>
          </el-menu-item>

          <el-menu-item index="/controls">
            <el-icon><ChatLineRound /></el-icon>
            <span>指令信息</span>
          </el-menu-item>

          <el-menu-item index="/operation-logs">
            <el-icon><Tickets /></el-icon>
            <span>操作历史</span>
          </el-menu-item>

          <el-menu-item index="/device">
            <el-icon><StarFilled /></el-icon>
            <span>设备管理</span>
          </el-menu-item>
        </el-menu>
      </el-aside>

      <el-container class="h-screen flex flex-col overflow-hidden">
        <el-header height="64px" class="shrink-0 flex items-center justify-between border-b border-slate-200 bg-white px-6">
          <span class="text-sm text-slate-500">水循环物联网应用系统</span>
          <el-tag type="success" effect="plain">系统就绪</el-tag>
        </el-header>
        <el-main class="flex-1 overflow-y-auto p-6">
          <slot />
        </el-main>
      </el-container>
    </el-container>
  </el-config-provider>
</template>

<style scoped>
.sidebar-menu {
  border-right: none;
}
</style>
