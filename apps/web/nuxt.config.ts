import { fileURLToPath } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import dotenv from 'dotenv'

dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)) })

const webPort = Number(process.env.WEB_PORT || 5174)

if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
  throw new Error('WEB_PORT 必须是 1 到 65535 之间的整数')
}

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devServer: {
    port: webPort,
  },
  
  ssr: false,
  devtools: { enabled: false },
  modules: ['@element-plus/nuxt', '@pinia/nuxt'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001/api',
      wsUrl: process.env.NUXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws',
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
})
