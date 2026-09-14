import { ElMessageBox } from 'element-plus'

import { useControlApi } from './api'

export const useDebugMode = () => {
  const api = useControlApi()
  const enabled = useState('automation-debug-mode', () => false)
  const loading = ref(false)

  const load = async () => {
    enabled.value = (await api.getDebugMode()).enabled
  }

  const change = async (next: boolean) => {
    if (next) {
      try {
        await ElMessageBox.confirm(
          '调试模式会跳过自动控制安全锁定，仅用于现场模拟测试。确认开启吗？',
          '开启调试模式',
          { type: 'warning', confirmButtonText: '确认开启', cancelButtonText: '取消' },
        )
      }
      catch {
        return
      }
    }
    loading.value = true
    try {
      enabled.value = (await api.setDebugMode(next)).enabled
    }
    finally {
      loading.value = false
    }
  }

  onMounted(() => void load())
  return { enabled, loading, change }
}
