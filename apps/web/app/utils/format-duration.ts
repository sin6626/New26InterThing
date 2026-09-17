/** 把非负秒数格式化为比赛页面统一使用的中文时长。 */
export const formatDuration = (seconds?: number) => {
  const total = Math.max(0, Math.floor(seconds ?? 0))
  const hours = Math.floor(total / 3_600)
  const minutes = Math.floor((total % 3_600) / 60)
  const remainingSeconds = total % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours}小时`)
  if (minutes) parts.push(`${minutes}分`)
  if (remainingSeconds || !parts.length) parts.push(`${remainingSeconds}秒`)
  return parts.join('')
}
