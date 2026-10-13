// State theo ngay cho tung profile (so search, diem, query da dung).
import fs from 'node:fs'
import path from 'node:path'

export type DayRecord = {
  desktop: { searches: number; pointsBefore: number | null; pointsAfter: number | null }
  mobile: { searches: number; pointsBefore: number | null; pointsAfter: number | null }
  daily: { items: unknown[]; pointsBefore: number | null; pointsAfter: number | null }
  /** Muc "Keep earning" tren /earn (the daily offer) */
  earn: {
    items: unknown[]
    pointsBefore: number | null
    pointsAfter: number | null
    sectionBefore: string | null
    sectionAfter: string | null
  }
  usedQueries: string[]
  runs: unknown[]
}

export type State = { version: number; days: Record<string, DayRecord> }

export function todayKey(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function loadState(file: string): State {
  try {
    const st = JSON.parse(fs.readFileSync(file, 'utf8')) as State
    if (!st.days) throw new Error('thieu days')
    return st
  } catch {
    return { version: 1, days: {} }
  }
}

export function saveState(file: string, st: State): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const keys = Object.keys(st.days).sort()
  while (keys.length > 60) delete st.days[keys.shift() as string]
  fs.writeFileSync(file, `${JSON.stringify(st, null, 2)}\n`, 'utf8')
}

export function dayRecord(st: State, date = todayKey()): DayRecord {
  st.days[date] ??= {
    desktop: { searches: 0, pointsBefore: null, pointsAfter: null },
    mobile: { searches: 0, pointsBefore: null, pointsAfter: null },
    daily: { items: [], pointsBefore: null, pointsAfter: null },
    earn: { items: [], pointsBefore: null, pointsAfter: null, sectionBefore: null, sectionAfter: null },
    usedQueries: [],
    runs: []
  }
  const d = st.days[date]
  d.usedQueries ??= []
  d.runs ??= []
  d.earn ??= { items: [], pointsBefore: null, pointsAfter: null, sectionBefore: null, sectionAfter: null }
  return d
}

export function rememberQuery(rec: DayRecord, q: string): void {
  rec.usedQueries.push(q)
  if (rec.usedQueries.length > 1500) rec.usedQueries.splice(0, rec.usedQueries.length - 1500)
}

export function usedQuerySet(rec: DayRecord): Set<string> {
  return new Set(rec.usedQueries ?? [])
}
