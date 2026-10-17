import type { ProxyItem } from './types'

/** Undefined means all eligible proxies; an explicit empty selection means none. */
export function proxyTestCandidates(items: ProxyItem[], ids?: string[]): ProxyItem[] {
  const selected = ids === undefined ? null : new Set(ids)
  const blockedUrls = new Set(items.filter(p => p.status && p.status !== 'active').map(p => p.url))
  return items.filter(p => (!p.status || p.status === 'active') && !blockedUrls.has(p.url) && (!selected || selected.has(p.id)))
}
