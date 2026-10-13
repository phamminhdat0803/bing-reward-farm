// Kiem tra ket noi proxy qua Playwright request engine.
import { request } from 'playwright-core'
import { parseProxy } from './core/browser'
import type { ProxyTestResult } from '../shared/types'

export async function testProxy(rawProxy: string): Promise<ProxyTestResult> {
  const parsed = parseProxy(rawProxy)
  if (!parsed) {
    return {
      ok: false,
      error: 'Định dạng proxy không hợp lệ (hỗ trợ host:port, host:port:user:pass, http://..., socks5://...)'
    }
  }

  const t0 = Date.now()
  try {
    const req = await request.newContext({
      proxy: {
        server: parsed.server,
        username: parsed.username,
        password: parsed.password
      },
      timeout: 12000
    })

    try {
      const res = await req.get('http://ip-api.com/json', { timeout: 12000 })
      const latency = Date.now() - t0
      if (!res.ok()) {
        return { ok: false, latency, error: `Proxy trả HTTP ${res.status()}: ${res.statusText()}` }
      }
      const data = (await res.json().catch(() => null)) as {
        status?: string
        query?: string
        country?: string
        city?: string
      } | null
      if (data && (data.status === 'success' || data.query)) {
        return {
          ok: true,
          ip: data.query,
          country: data.country,
          city: data.city,
          latency
        }
      }
      // Fallback ipify neu ip-api bi rate limit
      const fallback = await req.get('https://api.ipify.org?format=json', { timeout: 6000 }).catch(() => null)
      if (fallback && fallback.ok()) {
        const d = (await fallback.json().catch(() => null)) as { ip?: string } | null
        return { ok: true, ip: d?.ip ?? 'N/A', latency }
      }
      return { ok: true, ip: 'Kết nối thành công', latency }
    } finally {
      await req.dispose().catch(() => {})
    }
  } catch (e) {
    const latency = Date.now() - t0
    const msg = String((e as Error).message)
    let err = msg
    if (/timeout/i.test(msg)) err = 'Kết nối proxy quá thời gian (Timeout)'
    else if (/ECONNREFUSED/i.test(msg)) err = 'Không thể kết nối đến máy chủ proxy (Connection refused)'
    else if (/407/i.test(msg) || /proxy auth/i.test(msg)) err = 'Sai tài khoản hoặc mật khẩu proxy (407 Proxy Authentication Required)'
    else if (/ENOTFOUND/i.test(msg)) err = 'Không tìm thấy địa chỉ proxy (DNS not found)'
    return { ok: false, latency, error: err }
  }
}
