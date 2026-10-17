import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { keywordKey, type KeywordUsage } from '../shared/keywords'

type Entry = { type: 'put'; value: KeywordUsage } | { type: 'release'; key: string } | { type: 'migrated' }
let entries: Map<string, KeywordUsage> | null = null
const file = (): string => path.join(app.getPath('userData'), 'keyword-usage.jsonl')

function append(records: Entry[]): void {
  if (!records.length) return
  fs.mkdirSync(path.dirname(file()), { recursive: true })
  // Complete a durable, synchronous reservation before any browser request can start.
  fs.appendFileSync(file(), records.map(record => JSON.stringify(record)).join('\n') + '\n', { encoding: 'utf8', flush: true })
}
function load(): Map<string, KeywordUsage> {
  if (entries) return entries
  const loaded = new Map<string, KeywordUsage>()
  let migrated = false
  try {
    for (const line of fs.readFileSync(file(), 'utf8').split('\n')) {
      if (!line.trim()) continue
      const entry = JSON.parse(line) as Entry
      if (entry.type === 'migrated') migrated = true
      else if (entry.type === 'release' && typeof entry.key === 'string') loaded.delete(entry.key)
      else if (entry.type === 'put' && typeof entry.value?.keyword === 'string' && ['reserved', 'used'].includes(entry.value.status)) loaded.set(keywordKey(entry.value.keyword), entry.value)
      else throw new Error('Invalid usage entry')
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Không đọc được sổ từ khoá đã dùng. Dừng search để tránh tái sử dụng.')
  }
  if (!migrated) {
    const records: Entry[] = []
    const stateDir = path.join(app.getPath('userData'), 'state')
    if (fs.existsSync(stateDir)) {
      for (const name of fs.readdirSync(stateDir).filter(name => name.endsWith('.json'))) {
        let data: { days?: Record<string, { usedQueries?: string[] }> }
        try { data = JSON.parse(fs.readFileSync(path.join(stateDir, name), 'utf8')) }
        catch { throw new Error('Không đọc được lịch sử search cũ để đối chiếu từ khoá.') }
        for (const [day, record] of Object.entries(data.days ?? {})) {
          for (const keyword of record.usedQueries ?? []) {
            if (typeof keyword !== 'string' || !keyword.trim()) continue
            const key = keywordKey(keyword)
            if (loaded.has(key)) continue
            const value: KeywordUsage = { keyword, profileId: name.slice(0, -5), profileName: name.slice(0, -5), kind: 'history', status: 'used', at: /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${day}T00:00:00` : '' }
            loaded.set(key, value); records.push({ type: 'put', value })
          }
        }
      }
    }
    append([...records, { type: 'migrated' }])
  }
  entries = loaded
  return entries
}
export function keywordUsage(keywords?: string[]): KeywordUsage[] {
  const all = load()
  return keywords ? keywords.flatMap(keyword => { const entry = all.get(keywordKey(keyword)); return entry ? [entry] : [] }) : [...all.values()]
}
export function usedKeywordKeys(): Set<string> {
  return new Set(load().keys())
}
export function reserveKeyword(keyword: string, profile: { id: string; name: string }, kind: 'desktop' | 'mobile'): boolean {
  const all = load(), key = keywordKey(keyword)
  if (!key || all.has(key)) return false
  const value: KeywordUsage = { keyword, profileId: profile.id, profileName: profile.name, kind, status: 'reserved', at: new Date().toISOString() }
  append([{ type: 'put', value }]); all.set(key, value)
  return true
}
export function releaseKeyword(keyword: string, profileId: string): void {
  const all = load(), key = keywordKey(keyword), value = all.get(key)
  if (!value || value.profileId !== profileId || value.status !== 'reserved') return
  append([{ type: 'release', key }]); all.delete(key)
}
export function markKeywordUsed(keyword: string, profileId: string): void {
  const all = load(), key = keywordKey(keyword), previous = all.get(key)
  if (!previous || previous.profileId !== profileId || previous.status !== 'reserved') return
  const value: KeywordUsage = { ...previous, status: 'used', at: new Date().toISOString() }
  append([{ type: 'put', value }]); all.set(key, value)
}
