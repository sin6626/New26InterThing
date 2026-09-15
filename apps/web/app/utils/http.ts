import axios, { type AxiosRequestConfig } from 'axios'
import { backendEndpoints } from './backend-endpoints'

interface RequestSnapshot {
  method: string
  url: string
  headers: unknown
  params: unknown
}

interface LoggedRequestConfig extends AxiosRequestConfig {
  requestSnapshot?: RequestSnapshot
}

/** 全站 HTTP 客户端；响应拦截器输出完整调用信息，便于比赛现场定位接口问题。 */
export const createHttpClient = (baseURL: string) => {
  const config = useRuntimeConfig()
  baseURL = backendEndpoints(baseURL, config.public.wsUrl, config.public.serverPort).apiBase
  const client = axios.create({ baseURL, timeout: 10_000 })

  client.interceptors.request.use((config) => {
    const snapshot: RequestSnapshot = {
      method: (config.method || 'GET').toUpperCase(),
      url: `${config.baseURL || ''}${config.url || ''}`,
      headers: config.headers,
      params: config.params ?? config.data ?? null,
    }
    ;(config as LoggedRequestConfig).requestSnapshot = snapshot
    return config
  })

  client.interceptors.response.use(
    (response) => {
      const snapshot = (response.config as LoggedRequestConfig).requestSnapshot
      console.log({
        statusCode: response.status,
        method: snapshot?.method,
        url: snapshot?.url,
        headers: snapshot?.headers,
        params: snapshot?.params,
        response: response.data,
      })
      return response
    },
    (error) => {
      const snapshot = (error.config as LoggedRequestConfig | undefined)?.requestSnapshot
      console.error({
        statusCode: error.response?.status ?? null,
        method: snapshot?.method,
        url: snapshot?.url,
        headers: snapshot?.headers,
        params: snapshot?.params,
        response: error.response?.data ?? error.message,
      })
      if (error.response?.data?.message) {
        error.message = error.response.data.message
      }
      return Promise.reject(error)
    },
  )

  return client
}
