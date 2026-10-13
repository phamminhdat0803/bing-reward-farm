// Kho proxy dung chung: %APPDATA%\bing-reward-farm\proxies.json
// Tai khoan chi can chon proxy theo id (profile.proxyId) -> khong phai go tay chuoi proxy.
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { ProxyItem, ProxyTestResult } from '../shared/types'
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

/** Test 1 proxy va luu ket qua vao kho. */
export async function testAndSave(id: string): Promise<ProxyTestResult> {
  const item = getProxy(id)
  if (!item) return { ok: false, error: 'khong thay proxy' }
  const res = await testProxy(item.url)
  updateProxy(id, { lastTest: { ...res, at: new Date().toISOString() } })
  return res
}

/** Test tat ca (tuan tu cho nhe mang). */
export async function testAll(): Promise<Record<string, ProxyTestResult>> {
  const out: Record<string, ProxyTestResult> = {}
  for (const item of listProxies()) {
    // eslint-disable-next-line no-await-in-loop
    out[item.id] = await testAndSave(item.id)
  }
  return out
}
