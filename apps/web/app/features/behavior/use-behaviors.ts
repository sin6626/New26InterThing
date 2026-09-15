import type { BehaviorField, BehaviorItem, BehaviorOptions } from '@new26interthing/shared'
import dayjs from 'dayjs'

import { useBehaviorApi } from './api'

/** 行为页依赖动态字段定义，因此赛方字段变化时无需修改固定表头。 */
export const useBehaviors = () => {
  const api = useBehaviorApi()
  const loading = ref(false); const errorMessage = ref(''); const rows = ref<BehaviorItem[]>([])
  const options = ref<BehaviorOptions>({ fields: [] }); const total = ref(0); const page = reactive({ current: 1, size: 20 })
  const timeRange = ref<[Date, Date] | null>(null)
  const query = computed(() => ({ page: page.current, pageSize: page.size, startTime: timeRange.value ? dayjs(timeRange.value[0]).format('YYYY-MM-DD HH:mm:ss') : undefined, endTime: timeRange.value ? dayjs(timeRange.value[1]).format('YYYY-MM-DD HH:mm:ss') : undefined }))
  const load = async () => { const result = await api.getPage(query.value); rows.value = result.items; total.value = result.total }
  const loadCurrentPage = async () => { loading.value = true; errorMessage.value = ''; try { await load() } catch { rows.value = []; total.value = 0; errorMessage.value = '行为数据分页加载失败。' } finally { loading.value = false } }
  const search = async () => { page.current = 1; loading.value = true; errorMessage.value = ''; try { await load() } catch { rows.value = []; total.value = 0; errorMessage.value = '行为数据加载失败，请检查后端和数据库连接。' } finally { loading.value = false } }
  const initialize = async () => { loading.value = true; try { options.value = await api.getOptions(); await load() } catch { rows.value = []; errorMessage.value = '行为数据初始化失败，请检查字段映射和后端连接。' } finally { loading.value = false } }
  const reset = () => { timeRange.value = null; void search() }
  const fieldValue = (row: unknown, field: BehaviorField) => (row as BehaviorItem).fields[field.key] ?? '--'
  return { errorMessage, fieldValue, initialize, loadCurrentPage, loading, options, page, reset, rows, search, timeRange, total }
}
