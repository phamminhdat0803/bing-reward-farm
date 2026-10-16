// Lich su test proxy: ghi lai MOI lan kiem tra (song/chet) de biet proxy nao hong lien tuc ma xoa.
//
// Yeu cau nguoi dung (2026-10-16):
//  - Ra soat proxy song/chet; proxy nao **10 lan test deu chet** thi canh bao de nguoi dung xoa.
//  - Co cho loc de biet **so lan thanh cong / that bai**.
//  - Export duoc danh sach proxy.
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { ProxyAttempt, ProxyStat, ProxyTestResult } from '../shared/types'

export type { ProxyAttempt, ProxyStat }

type Store = {
  version: number
  items: Record<string, { url: string; label: string; firstAt: string; ok: number; fail: number; attempts: ProxyAttempt[] }>
}

const MAX_ATTEMPTS = 40
const FILE = (): string => path.join(app.getPath('userData'), 'proxy-history.json')

let store: Store = { version: 1, items: {} }
let loaded = false

function load(): void {
  if (loaded) return
  loaded = true
  try {
    const raw = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Store
    if (raw?.items) store = { version: 1, items: raw.items }
  } catch {
    /* chua co */
  }
}

let saveTimer: NodeJS.Timeout | null = null
function saveSoon(): void {
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    try {
      fs.mkdirSync(path.dirname(FILE()), { recursive: true })
      fs.writeFileSync(FILE(), `${JSON.stringify(store, null, 2)}\n`, 'utf8')
    } catch {
      /* bo qua */
    }
  }, 1500)
}

/** Ghi 1 lan test vao lich su. */
export function recordProxyTest(
  id: string,
  url: string,
  label: string,
  result: ProxyTestResult & { at?: string },
  status = result.ok ? 'live' : 'dead'
): void {
  load()
  const at = result.at ?? new Date().toISOString()
  const it = (store.items[id] ??= { url, label, firstAt: at, ok: 0, fail: 0, attempts: [] })
  it.url = url
  it.label = label
  if (result.ok) it.ok += 1
  else it.fail += 1
  it.attempts.push({
    at,
    ok: result.ok,
    status,
    latency: result.latency ?? null,
    ip: result.ip ?? null,
    country: result.country ?? null,
    error: result.error
  })
  if (it.attempts.length > MAX_ATTEMPTS) it.attempts.splice(0, it.attempts.length - MAX_ATTEMPTS)
  saveSoon()
}

/** Thong ke tung proxy (chi tinh cho proxy con trong kho). */
export function proxyStats(proxies: { id: string; url: string; label: string }[]): ProxyStat[] {
  load()
  return proxies.map((p) => {
    const it = store.items[p.id]
    const attempts = it?.attempts ?? []
    const last10 = attempts.slice(-10)
    const failStreak = (() => {
      let n = 0
      for (let i = attempts.length - 1; i >= 0; i -= 1) {
        if (attempts[i].ok) break
        n += 1
      }
      return n
    })()
    const last = attempts[attempts.length - 1] ?? null
    const total = (it?.ok ?? 0) + (it?.fail ?? 0)
    return {
      id: p.id,
      url: it?.url ?? p.url,
      label: it?.label ?? p.label,
      ok: it?.ok ?? 0,
      fail: it?.fail ?? 0,
      total,
      successRate: total ? Math.round(((it?.ok ?? 0) / total) * 100) : null,
      failStreak,
      dead10: last10.length >= 10 && last10.every((a) => !a.ok),
      lastAt: last?.at ?? null,
      lastOk: last ? last.ok : null,
      lastError: last?.error ?? null,
      lastLatency: last?.latency ?? null,
      firstAt: it?.firstAt ?? null,
      attempts
    }
  })
}

/** Xoa lich su (1 proxy hoac tat ca). */
export function clearProxyHistory(ids?: string[]): { cleared: number } {
  load()
  let n = 0
  if (ids && ids.length) {
    for (const id of ids) {
      if (store.items[id]) {
        delete store.items[id]
        n += 1
      }
    }
  } else {
    n = Object.keys(store.items).length
    store.items = {}
  }
  try {
    fs.writeFileSync(FILE(), `${JSON.stringify(store, null, 2)}\n`, 'utf8')
  } catch {
    /* bo qua */
  }
  return { cleared: n }
}

/** Xoa lich su cua cac proxy khong con trong kho (don rac). */
export function pruneProxyHistory(aliveIds: string[]): number {
  load()
  const keep = new Set(aliveIds)
  let n = 0
  for (const id of Object.keys(store.items)) {
    if (!keep.has(id)) {
      delete store.items[id]
      n += 1
    }
  }
  if (n) saveSoon()
  return n
}
