// Cache so lieu Rewards theo profile.
// Nguyen tac nguoi dung yeu cau (2026-10-13):
//   - Mo app KHONG tu mo trinh duyet.
//   - Chi mo trinh duyet khi: sang NGAY MOI (cache khac ngay hom nay) hoac nguoi dung bam "Cap nhat trang thai".
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import type { Snapshot } from './runner'

export type CachedSnapshot = Snapshot & { cachedAt: string; date: string }

type Store = { version: number; items: Record<string, CachedSnapshot> }

const FILE = (): string => path.join(app.getPath('userData'), 'cache.json')

export function todayKey(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function load(): Store {
  try {
    const st = JSON.parse(fs.readFileSync(FILE(), 'utf8')) as Store
    if (!st.items) throw new Error('bad cache')
    return st
  } catch {
    return { version: 1, items: {} }
  }
}

function save(st: Store): void {
  try {
    fs.mkdirSync(path.dirname(FILE()), { recursive: true })
    fs.writeFileSync(FILE(), `${JSON.stringify(st, null, 2)}\n`, 'utf8')
  } catch {
    /* bo qua */
  }
}

export function getAll(): Record<string, CachedSnapshot> {
  return load().items
}

export function get(profileId: string): CachedSnapshot | null {
  return load().items[profileId] ?? null
}

export function put(snapshot: Snapshot): CachedSnapshot {
  const st = load()
  const item: CachedSnapshot = { ...snapshot, cachedAt: new Date().toISOString(), date: todayKey() }
  st.items[snapshot.profileId] = item
  save(st)
  return item
}

export function remove(profileId: string): void {
  const st = load()
  delete st.items[profileId]
  save(st)
}

/**
 * Profile can lam moi vi cache la cua NGAY HOM QUA.
 * (Chua co cache thi KHONG tinh la "sang ngay moi" — nguoi dung tu bam Cap nhat trang thai.)
 */
export function needsNewDayRefresh(profileId: string): boolean {
  const c = get(profileId)
  if (!c) return false
  return c.date !== todayKey()
}

export function hasData(profileId: string): boolean {
  return !!get(profileId)
}
