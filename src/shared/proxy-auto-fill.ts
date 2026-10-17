import type { ProxyItem, ProxyStat } from './types'
export type ProxyFillOptions = { count: number; minRate: number; minTests: number }
export type ProxyFillRow = { profileId: string; name: string; status: 'ok' | 'skipped' | 'failed'; message: string; proxies: string[] }
export type ProxyFillState = { running: boolean; done: number; total: number; rows: ProxyFillRow[]; error?: string }
export function validateProxyFill(input: ProxyFillOptions): ProxyFillOptions {
  if (!input || !Number.isSafeInteger(input.count) || input.count < 1 || input.count > 20 || !Number.isSafeInteger(input.minRate) || input.minRate < 1 || input.minRate > 100 || !Number.isSafeInteger(input.minTests) || input.minTests < 1 || input.minTests > 10000) throw new Error('Số proxy 1–20, tỷ lệ 1–100%, tối thiểu 1–10.000 lần test.')
  return { count: input.count, minRate: input.minRate, minTests: input.minTests }
}
export function rankedReliableProxies(items: ProxyItem[], stats: ProxyStat[], options: ProxyFillOptions, occupied: Set<string>): ProxyItem[] {
  const byId = new Map(stats.map(s => [s.id, s]))
  const blocked = new Set(items.filter(p => p.status && p.status !== 'active').map(p => p.url))
  const seen = new Set<string>()
  return items.filter(p => {
    const stat = byId.get(p.id)
    return (!p.status || p.status === 'active') && !blocked.has(p.url) && !occupied.has(p.url) && p.lastTest?.ok !== false && stat?.url === p.url && stat.total >= options.minTests && stat.ok / stat.total * 100 >= options.minRate
  }).sort((a, b) => {
    const x = byId.get(a.id)!, y = byId.get(b.id)!
    return y.ok / y.total - x.ok / x.total || y.total - x.total || (a.lastTest?.latency ?? Infinity) - (b.lastTest?.latency ?? Infinity)
  }).filter(p => { if (seen.has(p.url)) return false; seen.add(p.url); return true })
}
