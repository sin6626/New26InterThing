/**
 * 浏览器从哪台电脑打开前端，就连接那台电脑的后端端口。
 * 显式配置仍优先，用于前后端不在同一主机的部署。
 */
export function backendEndpoints(
  apiBase: string,
  wsUrl: string,
  serverPort = 3001,
) {
  const hostname = typeof window === 'undefined' ? 'localhost' : window.location.hostname
  const host = hostname.includes(':') ? `[${hostname}]` : hostname
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:'

  return {
    apiBase: apiBase || `${secure ? 'https' : 'http'}://${host}:${serverPort}/api`,
    wsUrl: wsUrl || `${secure ? 'wss' : 'ws'}://${host}:${serverPort}/ws`,
  }
}
