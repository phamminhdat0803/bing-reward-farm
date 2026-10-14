// Kho proxy dung chung: %APPDATA%\bing-reward-farm\proxies.json
// Tai khoan chi can chon proxy theo id (profile.proxyId) -> khong phai go tay chuoi proxy.
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { ProxyItem, ProxyTestResult } from '../shared/types'
import { request } from 'playwright-core'
import { parseProxy } from './core/browser'
import { testProxy } from './proxy-test'

type Store = { version: number; items: ProxyItem[] }

const FILE = (): string => path.join(app.getPath('userData'), 'proxies.json')

function load(): Store {
  try {
    const st = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Store
    if (!Array.isArray(st.items)) throw new Error('bad store')
    return st
  } catch {
    return { version: 1, items: [] }
  }
}

function save(st: Store): void {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true })
  fs.writeFileSync(FILE(), `${JSON.stringify(st, null, 2)}\n`, 'utf8')
}

function slug(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || `proxy-${Date.now()}`
  )
}

export function listProxies(): ProxyItem[] {
  return load().items
}

export function getProxy(id: string): ProxyItem | null {
  return load().items.find((p) => p.id === id) ?? null
}

/** Chuoi proxy thuc te cua 1 profile: uu tien proxyId trong kho, roi den chuoi proxy cu. */
export function resolveProxyUrl(profile: { proxyId?: string | null; proxy?: string | null }): string | null {
  if (profile.proxyId) {
    const item = getProxy(profile.proxyId)
    if (item?.url) return item.url
  }
  return profile.proxy?.trim() ? profile.proxy : null
}

/** Them nhieu proxy 1 luc (dan danh sach, moi dong 1 proxy). Bo qua trung va dong trong. */
export function addProxyBulk(lines: string[]): { added: ProxyItem[]; skipped: number } {
  const st = load()
  const existing = new Set(st.items.map((p) => p.url))
  const added: ProxyItem[] = []
  let skipped = 0
  for (const raw of lines) {
    const url = String(raw || '').trim()
    if (!url || url.startsWith('#')) continue
    if (existing.has(url)) {
      skipped += 1
      continue
    }
    // ten goi nho: host:port (+ tien to giao thuc neu khac http)
    const m = url.match(/^(?:([a-z0-9]+):\/\/)?([^:/@]+)(?::(\d+))?/i)
    const scheme = (m?.[1] ?? 'http').toLowerCase()
    const label = m ? `${m[2]}:${m[3] ?? ''}${scheme !== 'http' ? ` (${scheme})` : ''}` : url
    const item: ProxyItem = { id: '', label, url, createdAt: new Date().toISOString() }
    let id = slug(label)
    if (st.items.some((p) => p.id === id)) id = `${id}-${Math.random().toString(36).slice(2, 6)}`
    item.id = id
    st.items.push(item)
    existing.add(url)
    added.push(item)
  }
  if (added.length) save(st)
  return { added, skipped }
}

/** Danh sach proxy theo thu tu uu tien cua 1 profile (chinh + du phong), da chuan hoa scheme. */
const chainOverride: Record<string, string[]> = {}

/** Sau preflight: chain thuc te se dung cho lan launch nay (khong can ghi lai profile). */
export function setActiveChain(profileId: string, chain: string[]): void {
  chainOverride[profileId] = chain
}
export function clearActiveChain(profileId: string): void {
  delete chainOverride[profileId]
}

export function resolveProxyChain(profile: {
  proxyId?: string | null
  proxy?: string | null
  proxyFallbacks?: string[] | null
}): string[] {
  const id = (profile as { id?: string }).id
  if (id && chainOverride[id] !== undefined) return chainOverride[id]
  const out: string[] = []
  const main = resolveProxyUrl(profile)
  if (main) out.push(main)
  for (const p of profile.proxyFallbacks ?? []) {
    const v = String(p || '').trim()
    if (v && !out.includes(v)) out.push(v)
  }
  return out
}

/** Trang thai suc khoe 1 proxy (do qua ip-api VA bing.com). */
export type ProxyHealth = {
  status: 'live' | 'dead' | 'blocks-bing'
  ip?: string
  country?: string
  latency?: number
  error?: string
  checkedAt: string
}

const COOLDOWN_MS = 5 * 60 * 1000 // Chromium danh dau bad proxy ~5 phut -> cooldown >= 5 phut
const cooldownUntil: Record<string, number> = {}
const healthCache: Record<string, ProxyHealth> = {}

/**
 * Kiem tra suc khoe proxy: ip-api (ket noi duoc) + bing.com (dung duoc cho Rewards).
 * Proxy thong ip-api nhung bi Bing chan (reset/403) => 'blocks-bing', KHONG dung lam chain.
 * Ket qua fail bi cooldown 5 phut de khong test lai lien tuc (tranh ping-pong A<->B).
 */
export async function checkProxyHealth(url: string, opts: { force?: boolean } = {}): Promise<ProxyHealth> {
  const now = Date.now()
  const cached = healthCache[url]
  if (!opts.force && cached && (cooldownUntil[url] ?? 0) > now) return cached

  const base = await testProxy(url)
  const at = new Date().toISOString()
  let health: ProxyHealth

  if (!base.ok) {
    health = { status: 'dead', latency: base.latency, error: base.error, checkedAt: at }
  } else {
    const parsed = parseProxy(url)
    if (!parsed) {
      health = { status: 'dead', error: 'khong phan tich duoc chuoi proxy', checkedAt: at }
    } else {
      const t0 = Date.now()
      let bingOk = false
      let bingErr: string | undefined
      try {
        const req = await request.newContext({
          proxy: { server: parsed.server, username: parsed.username, password: parsed.password },
          timeout: 15000
        })
        try {
          const res = await req.get('https://www.bing.com/?FORM=Z9FD1', { timeout: 15000 })
          bingOk = res.status() < 400
          if (!bingOk) bingErr = `Bing tra HTTP ${res.status()}`
        } finally {
          await req.dispose().catch(() => {})
        }
      } catch (e) {
        bingErr = String((e as Error).message).split('\n')[0].slice(0, 110)
      }
      health = bingOk
        ? {
            status: 'live',
            ip: base.ip,
            country: base.country,
            latency: Date.now() - t0,
            checkedAt: at
          }
        : {
            status: 'blocks-bing',
            ip: base.ip,
            country: base.country,
            latency: base.latency,
            error: bingErr ?? 'khong vao duoc bing',
            checkedAt: at
          }
    }
  }

  healthCache[url] = health
  if (health.status !== 'live') cooldownUntil[url] = Date.now() + COOLDOWN_MS
  return health
}

/** Preflight: tra ve cac proxy DUNG DUOC (qua duoc bing) trong chain, giu nguyen thu tu. */
export async function preflightChain(
  chain: string[]
): Promise<{ live: string[]; dead: { proxy: string; error?: string }[] }> {
  const live: string[] = []
  const dead: { proxy: string; error?: string }[] = []
  for (const p of chain) {
    // eslint-disable-next-line no-await-in-loop
    const h = await checkProxyHealth(p)
    if (h.status === 'live') live.push(p)
    else dead.push({ proxy: p, error: `${h.status === 'blocks-bing' ? 'song nhung CHAN BING' : 'chet'}: ${h.error ?? ''}` })
  }
  return { live, dead }
}

export function addProxy(input: Partial<ProxyItem>): ProxyItem {
  const st = load()
  const label = (input.label || '').trim() || `Proxy ${st.items.length + 1}`
  const url = (input.url || '').trim()
  if (!url) throw new Error('chua nhap chuoi proxy')
  let id = input.id?.trim() || slug(label)
  if (st.items.some((p) => p.id === id)) id = `${id}-${Date.now().toString(36).slice(-4)}`
  const item: ProxyItem = {
    id,
    label,
    url,
    note: input.note,
    createdAt: new Date().toISOString()
  }
  st.items.push(item)
  save(st)
  return item
}

export function updateProxy(id: string, patch: Partial<ProxyItem>): ProxyItem {
  const st = load()
  const p = st.items.find((x) => x.id === id)
  if (!p) throw new Error(`khong thay proxy "${id}"`)
  Object.assign(p, patch, { id: p.id })
  save(st)
  return p
}

export function removeProxy(id: string): void {
  const st = load()
  st.items = st.items.filter((p) => p.id !== id)
  save(st)
}

/** Xoa nhieu proxy 1 luc, ghi file 1 lan. */
export function removeProxies(ids: string[]): { removed: number } {
  const set = new Set(ids)
  const st = load()
  const before = st.items.length
  st.items = st.items.filter((p) => !set.has(p.id))
  const removed = before - st.items.length
  if (removed > 0) save(st)
  return { removed }
}

/** Test 1 proxy va luu ket qua vao kho. */
export async function testAndSave(id: string): Promise<ProxyTestResult> {
  const item = getProxy(id)
  if (!item) return { ok: false, error: 'khong thay proxy' }
  const res = await testProxy(item.url)
  updateProxy(id, { lastTest: { ...res, at: new Date().toISOString() } })
  return res
}

/** Test tat ca hoac danh sach proxy duoc chon (song song co gioi han), CHI ghi file 1 lan cho nhanh va tranh tranh chap. */
export async function testAll(concurrency = 6, filterIds?: string[]): Promise<Record<string, ProxyTestResult>> {
  const all = listProxies()
  const items = filterIds && filterIds.length > 0 ? all.filter((p) => filterIds.includes(p.id)) : all
  const out: Record<string, ProxyTestResult> = {}
  let i = 0
  const worker = async (): Promise<void> => {
    while (i < items.length) {
      const idx = i
      i += 1
      const item = items[idx]
      // eslint-disable-next-line no-await-in-loop
      const res = await testProxy(item.url)
      out[item.id] = res
      const st = load()
      const target = st.items.find((x) => x.id === item.id)
      if (target) target.lastTest = { ...res, at: new Date().toISOString() }
      save(st)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return out
}
