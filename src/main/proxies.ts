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

/** Trang thai suc khoe da do, tra theo proxyId (cho UI hien proxy dang dung + IP ra). */
let healthTimer: NodeJS.Timeout | null = null
let healthNotifier: (() => void) | null = null

/** Renderer dang ky de duoc bao moi khi suc khoe proxy thay doi (chap mau xanh/do ngay lap tuc). */
export function setHealthNotifier(fn: (() => void) | null): void {
  healthNotifier = fn
}

/**
 * Health checker dinh ky trong main: do lai suc khoe cac proxy trong kho.
 * - Chu ky 45s (trong khoang 30-60s), toi da 4 proxy do song song.
 * - checkProxyHealth da tu ton trong cooldown 5 phut => proxy vua fail khong bi do lai lien tuc
 *   (tranh ping-pong A<->B va tranh bi chinh proxy/Chen rate-limit).
 */
export function startHealthLoop(opts: { everyMs?: number; concurrency?: number } = {}): void {
  if (healthTimer) return
  const everyMs = opts.everyMs ?? 45000
  const conc = Math.max(1, opts.concurrency ?? 4)
  let cursor = 0
  const tick = async (): Promise<void> => {
    const all = listProxies().map((p) => p.url)
    if (all.length === 0) return
    // Chi do toi da 12 proxy moi chu ky va bo qua proxy dang cooldown -> khong bao gio do 251 proxy cung luc
    const batch: string[] = []
    for (let k = 0; k < all.length && batch.length < 12; k += 1) {
      const url = all[(cursor + k) % all.length]
      if ((cooldownUntil[url] ?? 0) <= Date.now()) batch.push(url)
    }
    cursor = (cursor + Math.max(1, batch.length)) % all.length
    if (batch.length === 0) {
      console.log('[health] tat ca proxy dang cooldown, bo qua chu ky nay')
      return
    }
    let i = 0
    const worker = async (): Promise<void> => {
      while (i < batch.length) {
        const idx = i
        i += 1
        // eslint-disable-next-line no-await-in-loop
        await checkProxyHealth(batch[idx]).catch(() => {})
      }
    }
    await Promise.all(Array.from({ length: Math.min(conc, batch.length) }, () => worker())).catch(() => {})
    const live = batch.filter((u) => healthCache[u]?.status === 'live').length
    console.log(`[health] da do ${batch.length}/${all.length} proxy (song: ${live}, chu ky ${everyMs}ms)`)
  }
  healthTimer = setInterval(() => void tick(), everyMs)
  healthTimer.unref?.()
  void tick()
}

export function stopHealthLoop(): void {
  if (healthTimer) clearInterval(healthTimer)
  healthTimer = null
}

export function getHealthById(): Record<string, ProxyHealth> {
  const res: Record<string, ProxyHealth> = {}
  for (const p of listProxies()) {
    const h = healthCache[p.url]
    if (h) res[p.id] = h
  }
  return res
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
  lastGoodProxy?: string | null
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
  // Goi y tu lan chay truoc: uu tien proxy song gan nhat nhung KHONG bo proxy nao cua nguoi dung
  const good = String(profile.lastGoodProxy || '').trim()
  if (good && out.includes(good)) {
    return [good, ...out.filter((u) => u !== good)]
  }
  if (good && out.length === 0) return [good]
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

  const at = new Date().toISOString()
  const parsed = parseProxy(url)
  if (!parsed) {
    const h: ProxyHealth = { status: 'dead', error: 'khong phan tich duoc chuoi proxy', checkedAt: at }
    healthCache[url] = h
    return h
  }

  // BUOC 1 (quan trong nhat): qua duoc bing.com moi dung duoc cho Rewards.
  const t0 = Date.now()
  let bingOk = false
  let bingStatus = 0
  let bingErr: string | undefined
  try {
    const req = await request.newContext({
      proxy: { server: parsed.server, username: parsed.username, password: parsed.password },
      timeout: 15000
    })
    try {
      const res = await req.get('https://www.bing.com/?FORM=Z9FD1', { timeout: 15000 })
      bingStatus = res.status()
      bingOk = bingStatus < 400
    } finally {
      await req.dispose().catch(() => {})
    }
  } catch (e) {
    bingErr = String((e as Error).message).split('\n')[0].slice(0, 110)
  }
  const latency = Date.now() - t0

  // BUOC 2: lay IP ra chi de HIEN THI. ip-api co the rate-limit (429) -> KHONG duoc coi la proxy chet.
  let ip: string | undefined
  let country: string | undefined
  const info = await testProxy(url).catch(() => null)
  if (info?.ok) {
    ip = info.ip
    country = info.country
  }

  let health: ProxyHealth
  if (bingOk) {
    health = { status: 'live', ip, country, latency, checkedAt: at }
  } else if (bingStatus === 403 || bingStatus === 429) {
    // Ket noi duoc nhung Bing tu choi -> khong dung duoc cho Rewards
    health = { status: 'blocks-bing', ip, country, latency, error: `Bing tra HTTP ${bingStatus}`, checkedAt: at }
  } else if (bingErr || bingStatus >= 400) {
    health = {
      status: 'blocks-bing',
      ip,
      country,
      latency,
      error: bingErr ?? `Bing tra HTTP ${bingStatus}`,
      checkedAt: at
    }
  } else {
    health = { status: 'dead', ip, country, latency, error: 'khong ket noi duoc proxy', checkedAt: at }
  }

  healthCache[url] = health
  if (health.status === 'live') delete cooldownUntil[url]
  else cooldownUntil[url] = Date.now() + COOLDOWN_MS
  healthNotifier?.()
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
/**
 * Test 1 proxy va luu ket qua.
 * Dung CHINH phep kiem tra cua cham trang thai (checkProxyHealth: Bing la chinh, ip-api lay IP)
 * de tab Proxy va cham mau tren bang luon nhat quan — truoc day test bang ip-api nen vua bao XANH
 * o tab, vua DO o bang (hoac nguoc lai).
 */
export async function testAndSave(id: string): Promise<ProxyTestResult> {
  const item = getProxy(id)
  if (!item) return { ok: false, error: 'khong thay proxy' }
  const res = await testProxyWithHealth(item.url)
  updateProxy(id, { lastTest: { ...res, at: new Date().toISOString() } })
  console.log('[health] test thu cong:', item.url, '->', res.ok ? 'OK' : `FAIL (${res.error ?? ''})`)
  healthNotifier?.()
  return res
}

/** Chay checkProxyHealth (Bing + ip-api) roi doi sang ProxyTestResult de luu/hien thi. */
async function testProxyWithHealth(url: string): Promise<ProxyTestResult> {
  const h = await checkProxyHealth(url, { force: true })
  if (h.status === 'live') {
    return { ok: true, ip: h.ip, country: h.country, latency: h.latency }
  }
  const why =
    h.status === 'blocks-bing'
      ? `song nhung CHAN BING: ${h.error ?? 'khong vao duoc bing'}`
      : (h.error ?? 'khong ket noi duoc proxy')
  return { ok: false, ip: h.ip, country: h.country, latency: h.latency, error: why }
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
      const res = await testProxyWithHealth(item.url)
      out[item.id] = res
      const st = load()
      const target = st.items.find((x) => x.id === item.id)
      if (target) target.lastTest = { ...res, at: new Date().toISOString() }
      save(st)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  healthNotifier?.()
  return out
}
