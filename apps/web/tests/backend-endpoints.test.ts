import { afterEach, describe, expect, it, vi } from 'vitest'
import { backendEndpoints } from '../app/utils/backend-endpoints'

afterEach(() => vi.unstubAllGlobals())

describe('backendEndpoints', () => {
  it('uses the browser host when no backend address is configured', () => {
    vi.stubGlobal('window', {
      location: { hostname: '192.168.1.20', protocol: 'http:' },
    })
    expect(backendEndpoints('', '', 3001)).toEqual({
      apiBase: 'http://192.168.1.20:3001/api',
      wsUrl: 'ws://192.168.1.20:3001/ws',
    })
  })

  it('preserves explicitly configured addresses', () => {
    vi.stubGlobal('window', {
      location: { hostname: '192.168.1.20', protocol: 'http:' },
    })
    expect(backendEndpoints('http://other/api', 'ws://other/ws')).toEqual({
      apiBase: 'http://other/api',
      wsUrl: 'ws://other/ws',
    })
  })

  it('brackets IPv6 browser hosts', () => {
    vi.stubGlobal('window', {
      location: { hostname: '::1', protocol: 'http:' },
    })
    expect(backendEndpoints('', '').apiBase).toBe('http://[::1]:3001/api')
  })
})
