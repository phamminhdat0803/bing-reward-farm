// Lich su chay: doc `state/<profileId>.json` (moi ngay 1 muc) va tra ve du lieu da tong hop cho tab Lich su.
//
// Nguon du lieu (da co san, khong can parse log):
//   days[<YYYY-MM-DD>] = {
//     desktop|mobile: { searches, pointsBefore, pointsAfter },
//     daily:  { items: [{label, href, visited, reward}], pointsBefore, pointsAfter },
//     earn:   { items: [{label, points, visited}], pointsBefore, pointsAfter, sectionBefore },
//     runs:   [{ at, summary: { <kind>: { kind, searches, status, pointsBefore, pointsAfter, counterBefore, counterAfter } } }],
//     usedQueries: string[]
//   }
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { loadStore } from './profiles'
import type { HistoryData, HistoryDay, HistoryItem, HistoryRun, HistoryTask } from '../shared/types'

export type { HistoryData, HistoryDay, HistoryItem, HistoryRun, HistoryTask }

const stateFile = (profileId: string): string => path.join(app.getPath('userData'), 'state', `${profileId}.json`)

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

function taskFrom(raw: unknown, kind: 'search' | 'link'): HistoryTask {
  const o = (raw ?? {}) as Record<string, unknown>
  const items = Array.isArray(o.items)
    ? (o.items as Record<string, unknown>[]).map((it) => ({
        label: String(it.label ?? '').replace(/\s+/g, ' ').slice(0, 140),
        reward: it.reward != null ? String(it.reward) : it.points != null ? String(it.points) : null,
        visited: it.visited === true
      }))
    : []
  const done = kind === 'search' ? (num(o.searches) ?? 0) : items.filter((i) => i.visited).length
  const before = num(o.pointsBefore)
  const after = num(o.pointsAfter)
  return {
    done,
    total: kind === 'link' ? items.length || null : null,
    pointsBefore: before,
    pointsAfter: after,
    gained: before != null && after != null ? after - before : null,
    items
  }
}

function parseRuns(raw: unknown, date: string, profileId: string): HistoryRun[] {
  if (!Array.isArray(raw)) return []
  const out: HistoryRun[] = []
  for (const r of raw as Record<string, unknown>[]) {
    const at = String(r.at ?? `${date}T00:00:00.000Z`)
    const summary = (r.summary ?? {}) as Record<string, Record<string, unknown>>
    for (const [kind, s] of Object.entries(summary)) {
      const before = num(s.pointsBefore)
      const after = num(s.pointsAfter)
      out.push({
        at,
        date,
        profileId,
        kind,
        searches: num(s.searches),
        status: String(s.status ?? '?'),
        pointsBefore: before,
        pointsAfter: after,
        gained: before != null && after != null ? after - before : null,
        counterBefore: s.counterBefore != null ? String(s.counterBefore) : null,
        counterAfter: s.counterAfter != null ? String(s.counterAfter) : null
      })
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at))
}

/** Doc lich su cua tat ca (hoac 1) tai khoan, gioi han `days` ngay gan nhat. */
export function listHistory(opts: { profileId?: string; days?: number } = {}): HistoryData {
  const store = loadStore()
  const profiles = store.profiles
    .filter((p) => !opts.profileId || p.id === opts.profileId)
    .map((p) => ({ id: p.id, name: p.name, account: p.account }))

  const cutoff = opts.days && opts.days > 0 ? new Date(Date.now() - opts.days * 86400_000).toISOString().slice(0, 10) : null
  const days: HistoryDay[] = []

  for (const p of profiles) {
    let raw: { days?: Record<string, Record<string, unknown>> } = {}
    try {
      raw = JSON.parse(fs.readFileSync(stateFile(p.id), 'utf8')) as typeof raw
    } catch {
      continue
    }
    for (const [date, d] of Object.entries(raw.days ?? {})) {
      if (cutoff && date < cutoff) continue
      const runs = parseRuns(d.runs, date, p.id)
      const desktop = taskFrom(d.desktop, 'search')
      const mobile = taskFrom(d.mobile, 'search')
      const daily = taskFrom(d.daily, 'link')
      const earn = taskFrom(d.earn, 'link')

      // diem dau/cuoi: gom tu cac run (co timestamp) + cac muc task
      const marks: { at: string; before: number | null; after: number | null }[] = runs.map((r) => ({
        at: r.at,
        before: r.pointsBefore,
        after: r.pointsAfter
      }))
      for (const t of [desktop, mobile, daily, earn]) marks.push({ at: date, before: t.pointsBefore, after: t.pointsAfter })
      const befores = marks.map((m) => m.before).filter((x): x is number => x != null)
      const afters = marks.map((m) => m.after).filter((x): x is number => x != null)
      const pointsFirst = befores.length ? Math.min(...befores) : null
      const pointsLast = afters.length ? Math.max(...afters) : null

      const warnings = Array.from(
        new Set(
          runs
            .filter((r) => r.status !== 'done' && r.status !== 'credited')
            .map((r) => `${r.kind}: ${r.status}${r.status === 'check-failed' ? ' (không xác nhận được điểm)' : ''}`)
        )
      )

      days.push({
        date,
        profileId: p.id,
        name: p.name,
        account: p.account,
        desktop,
        mobile,
        daily,
        earn,
        gained: pointsFirst != null && pointsLast != null ? pointsLast - pointsFirst : null,
        pointsFirst,
        pointsLast,
        runs,
        warnings
      })
    }
  }

  days.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
  return { at: new Date().toISOString(), days, profiles }
}
