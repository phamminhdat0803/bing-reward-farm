import type { Profile, ProxyItem, ProxyStat } from './types'

export type AccountProxyFillRequest = { profileId: string; count: number }
export type AccountProxyAttempt = {
  proxyId: string; label: string; ok: boolean; latency?: number; ip?: string; country?: string; checkedAt: string
}
export type AccountProxyFillJob = {
  id: string; profileId: string; name: string; count: number
  status: 'checking' | 'stopping' | 'completed' | 'failed' | 'cancelled'
  total: number; checked: number; attempts: AccountProxyAttempt[]; assigned: AccountProxyAttempt[]; message: string
}

export function validateAccountProxyFill(input: AccountProxyFillRequest): AccountProxyFillRequest {
  if (!input || typeof input.profileId !== 'string' || !input.profileId.trim() || !Number.isSafeInteger(input.count) || input.count < 1 || input.count > 20) {
    throw new Error('Chọn một tài khoản và nhập số proxy là số nguyên từ 1 đến 20.')
  }
  return { profileId: input.profileId, count: input.count }
}

export function profileProxyUrls(profile: Pick<Profile, 'proxyId' | 'proxy' | 'proxyFallbacks' | 'lastGoodProxy'>, items: ProxyItem[]): Set<string> {
  const byId = new Map(items.map(item => [item.id, item.url]))
  return new Set([profile.proxyId ? byId.get(profile.proxyId) : null, profile.proxy, profile.lastGoodProxy,
    ...(profile.proxyFallbacks ?? []).map(value => byId.get(value) ?? value)].filter((value): value is string => !!value))
}

/** Rotate to different, unowned URLs. History ranks candidates; only a fresh network test qualifies them. */
export function accountProxyCandidates(items: ProxyItem[], stats: ProxyStat[], profiles: Profile[], profileId: string): ProxyItem[] {
  const excluded = new Set<string>()
  for (const profile of profiles) for (const url of profileProxyUrls(profile, items)) excluded.add(url)
  for (const item of items) if (item.status && item.status !== 'active') excluded.add(item.url)
  const byId = new Map(items.map(item => [item.id, item.url]))
  const history = new Map(stats.filter(stat => byId.get(stat.id) === stat.url).map(stat => [stat.id, stat]))
  const rate = (item: ProxyItem): number => {
    const stat = history.get(item.id)
    return stat && stat.total > 0 ? stat.ok / stat.total : item.lastTest?.ok ? 1 : 0
  }
  const seen = new Set<string>()
  if (!profiles.some(profile => profile.id === profileId)) return []
  return items.filter(item => (!item.status || item.status === 'active') && !excluded.has(item.url) && item.lastTest?.ok !== false)
    .sort((a, b) => rate(b) - rate(a) || (history.get(b.id)?.total ?? 0) - (history.get(a.id)?.total ?? 0) || (a.lastTest?.latency ?? Infinity) - (b.lastTest?.latency ?? Infinity))
    .filter(item => { if (seen.has(item.url)) return false; seen.add(item.url); return true })
}

export function proxyFillRunning(job: AccountProxyFillJob | null): boolean {
  return job?.status === 'checking' || job?.status === 'stopping'
}
