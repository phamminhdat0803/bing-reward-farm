import type { ProxyItem, RowState } from '@shared/types'

export function parseProxyCount(value: string): number | null {
  const count = Number(value)
  return Number.isSafeInteger(count) && count > 0 ? count : null
}

/** Chọn tối đa count URL khác nhau, chưa tài khoản khác sử dụng; bỏ proxy đã test lỗi. */
export function selectQuickProxies(items: ProxyItem[], rows: RowState[], currentId: string | undefined, count: number): ProxyItem[] {
  if (!Number.isSafeInteger(count) || count < 1) return []
  const byId = new Map(items.map(item => [item.id, item]))
  const used = new Set<string>()
  for (const row of rows) {
    if (row.id === currentId) continue
    const profile = row.profile
    if (profile.proxyId) {
      const main = byId.get(profile.proxyId)
      if (main) used.add(main.url)
    }
    if (profile.proxy) used.add(profile.proxy)
    for (const fallback of profile.proxyFallbacks ?? []) used.add(byId.get(fallback)?.url ?? fallback)
  }
  const latency = (item: ProxyItem): number =>
    item.lastTest?.latency != null && Number.isFinite(item.lastTest.latency) && item.lastTest.latency >= 0
      ? item.lastTest.latency
      : Infinity
  const candidates = items
    .filter(item => (!item.status || item.status === 'active') && !used.has(item.url) && item.lastTest?.ok !== false)
    .sort((a, b) => Number(!!b.lastTest?.ok) - Number(!!a.lastTest?.ok) || latency(a) - latency(b))
  const seen = new Set<string>()
  const picks: ProxyItem[] = []
  for (const item of candidates) {
    if (seen.has(item.url)) continue
    seen.add(item.url)
    picks.push(item)
    if (picks.length === count) break
  }
  return picks
}
