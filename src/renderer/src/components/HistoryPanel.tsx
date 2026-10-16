import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, CalendarDays, Check, ChevronDown, Copy, Download, Info, RefreshCw, TriangleAlert } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import type { HistoryData, HistoryDay, HistoryTask } from '@shared/types'

const RANGES = [
  { label: '7 ngày', days: 7 },
  { label: '14 ngày', days: 14 },
  { label: '30 ngày', days: 30 },
  { label: 'Tất cả', days: 0 }
]

const fmt = (n: number | null | undefined): string => (n == null ? '—' : String(n))
const dayLabel = (d: string): string => {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}
const dowLabel = (d: string): string => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(`${d}T00:00:00`).getDay()]

/** Thanh tiến độ nhỏ: done/total */
function MiniBar({ done, total, tone = 'blue' }: { done: number; total: number | null; tone?: 'blue' | 'green' }): React.JSX.Element {
  const pct = total && total > 0 ? Math.min(100, Math.round((done / total) * 100)) : done > 0 ? 100 : 0
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-[54px] overflow-hidden rounded-full bg-[var(--hairline)]">
        <span
          className={`block h-full rounded-full ${tone === 'green' ? 'bg-emerald-500' : 'bg-[var(--brand-blue-deep)]'}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="mm-tabular text-[11.5px] text-[var(--steel)]">
        {done}
        {total ? `/${total}` : ''}
      </span>
    </span>
  )
}

/** Bieu do cot theo ngay (SVG, khong dung thu vien ngoai) — xep chong theo tai khoan khi xem tat ca. */
function DailyChart({
  rows,
  profiles
}: {
  rows: HistoryDay[]
  profiles: { id: string; name: string }[]
}): React.JSX.Element {
  const [hover, setHover] = useState<number | null>(null)
  const byDate = useMemo(() => {
    const m = new Map<string, { date: string; total: number; byProfile: Record<string, number> }>()
    for (const r of rows) {
      const g = Math.max(0, r.gained ?? 0)
      const cur = m.get(r.date) ?? { date: r.date, total: 0, byProfile: {} }
      cur.total += g
      cur.byProfile[r.profileId] = (cur.byProfile[r.profileId] ?? 0) + g
      m.set(r.date, cur)
    }
    return Array.from(m.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [rows])

  if (!byDate.length) return <div className="px-3 py-6 text-center text-[12.5px] text-[var(--steel)]">Chưa có dữ liệu điểm theo ngày.</div>

  const W = 980
  const H = 168
  const padL = 44
  const padB = 26
  const padT = 12
  const max = Math.max(30, ...byDate.map((d) => d.total))
  const bw = Math.max(10, Math.min(46, (W - padL - 12) / byDate.length - 8))
  const colors = ['var(--brand-blue-deep)', '#22b8a6', '#f0a13a', '#a06bf0', '#e5527a', '#5b8def', '#3fa66a']

  return (
    <div className="relative px-3 pt-2 pb-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[168px] w-full" preserveAspectRatio="none">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const y = padT + (H - padT - padB) * (1 - f)
          return (
            <g key={f}>
              <line x1={padL} x2={W - 8} y1={y} y2={y} stroke="var(--hairline)" strokeWidth="1" />
              <text x={padL - 6} y={y + 3.5} textAnchor="end" fontSize="10" fill="var(--stone)">
                {Math.round(max * f)}
              </text>
            </g>
          )
        })}
        {byDate.map((d, i) => {
          const x = padL + i * ((W - padL - 12) / byDate.length) + 4
          let acc = 0
          const h = (v: number): number => (v / max) * (H - padT - padB)
          return (
            <g key={d.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={x - 3} y={padT} width={bw + 6} height={H - padT - padB} fill="transparent" />
              {profiles.map((p, pi) => {
                const v = d.byProfile[p.id] ?? 0
                if (v <= 0) return null
                const hh = h(v)
                const y = H - padB - acc - hh
                acc += hh
                return <rect key={p.id} x={x} y={y} width={bw} height={hh} rx="2" fill={colors[pi % colors.length]} opacity={hover === null || hover === i ? 1 : 0.45} />
              })}
              <text x={x + bw / 2} y={H - padB + 12} textAnchor="middle" fontSize="10" fill="var(--stone)">
                {dayLabel(d.date)}
              </text>
            </g>
          )
        })}
      </svg>
      {hover != null && byDate[hover] ? (
        <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1.5 text-[11.5px] shadow-sm">
          <b>{byDate[hover].date}</b> · +{byDate[hover].total} điểm
          <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5">
            {profiles
              .filter((p) => (byDate[hover].byProfile[p.id] ?? 0) > 0)
              .map((p) => (
                <span key={p.id} className="text-[var(--steel)]">
                  {p.name}: +{byDate[hover].byProfile[p.id]}
                </span>
              ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function TaskCell({ t, unit }: { t: HistoryTask; unit: 'search' | 'link' }): React.JSX.Element {
  const has = t.done > 0 || (t.gained ?? 0) > 0
  return (
    <div className="flex flex-col gap-0.5">
      {unit === 'search' ? (
        <MiniBar done={t.done} total={null} />
      ) : (
        <MiniBar done={t.done} total={t.total ?? null} tone="green" />
      )}
      <span className="mm-tabular text-[11px] text-[var(--stone)]">{has ? `${fmt(t.gained)} điểm` : '—'}</span>
    </div>
  )
}

/**
 * Tab "Lịch sử": đọc state/<id>.json — mỗi ngày 1 dòng tổng hợp + chi tiết từng lượt chạy.
 * Có biểu đồ theo ngày, lọc theo tài khoản/khoảng thời gian/task, tìm kiếm, xuất CSV.
 */
export function HistoryPanel(): React.JSX.Element {
  const [data, setData] = useState<HistoryData | null>(null)
  const [busy, setBusy] = useState(false)
  const [rangeDays, setRangeDays] = useState(7)
  const [profileId, setProfileId] = useState('')
  const [query, setQuery] = useState('')
  const [onlyWarn, setOnlyWarn] = useState(false)
  const [openRow, setOpenRow] = useState<string | null>(null)

  const load = async (days = rangeDays, pid = profileId): Promise<void> => {
    setBusy(true)
    try {
      setData(await window.api.listHistory({ days, profileId: pid || undefined }))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void load(rangeDays, profileId)
  }, [rangeDays, profileId])

  const rows = useMemo(() => {
    let list = data?.days ?? []
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (d) =>
          d.date.includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.account.toLowerCase().includes(q) ||
          d.warnings.some((w) => w.toLowerCase().includes(q))
      )
    }
    if (onlyWarn) list = list.filter((d) => d.warnings.length > 0)
    return list
  }, [data, query, onlyWarn])

  const kpi = useMemo(() => {
    const total = rows.reduce((s, r) => s + Math.max(0, r.gained ?? 0), 0)
    const dates = new Set(rows.map((r) => r.date))
    const runs = rows.reduce((s, r) => s + r.runs.length, 0)
    const warn = rows.reduce((s, r) => s + r.warnings.length, 0)
    const avg = dates.size ? Math.round(total / dates.size) : 0
    return { total, dates: dates.size, runs, warn, avg }
  }, [rows])

  const exportCsv = async (): Promise<void> => {
    const head = 'ngay,tai_khoan,desktop_search,mobile_search,daily_set,keep_earning,diem_dau,diem_cuoi,diem_kiem,luot_chay,canh_bao'
    const lines = rows.map((r) =>
      [
        r.date,
        r.name,
        r.desktop.done,
        r.mobile.done,
        `${r.daily.done}/${r.daily.total ?? '?'}`,
        `${r.earn.done}/${r.earn.total ?? '?'}`,
        r.pointsFirst ?? '',
        r.pointsLast ?? '',
        r.gained ?? '',
        r.runs.length,
        `"${r.warnings.join('; ')}"`
      ].join(',')
    )
    const csv = [head, ...lines].join('\n')
    await navigator.clipboard.writeText(csv).catch(() => {})
    toast.success(`Đã copy CSV ${rows.length} dòng vào clipboard (dán vào Excel/Sheets).`)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Thanh lọc */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 py-1.5">
        <div className="flex items-center gap-1 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface)] p-0.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              onClick={() => setRangeDays(r.days)}
              className={
                'rounded-[6px] px-2 py-[3px] text-[12px] transition ' +
                (rangeDays === r.days ? 'bg-[var(--brand-blue-deep)] font-medium text-white' : 'text-[var(--steel)] hover:bg-[var(--surface-soft)]')
              }
            >
              {r.label}
            </button>
          ))}
        </div>

        <select
          className="h-7 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface)] px-1.5 text-[12.5px]"
          value={profileId}
          onChange={(e) => setProfileId(e.target.value)}
        >
          <option value="">Tất cả tài khoản</option>
          {(data?.profiles ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          className="h-7 w-[180px] rounded-[8px] border border-[var(--hairline)] bg-[var(--surface)] px-2 text-[12.5px]"
          placeholder="Tìm ngày / tài khoản / lỗi…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--steel)]">
          <input type="checkbox" checked={onlyWarn} onChange={(e) => setOnlyWarn(e.target.checked)} />
          chỉ ngày có cảnh báo
        </label>

        <Button size="sm" variant="tertiary" className="gap-1.5" disabled={busy} onClick={() => void load()}>
          <RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} /> Làm mới
        </Button>
        <Button size="sm" variant="tertiary" className="gap-1.5" disabled={!rows.length} onClick={() => void exportCsv()}>
          <Download className="size-3.5" /> Xuất CSV
        </Button>
        <span className="ml-auto text-[12px] text-[var(--stone)]">
          {data?.at ? `Cập nhật ${new Date(data.at).toLocaleTimeString('vi-VN').slice(0, 5)}` : ''}
        </span>
      </div>

      {/* KPI */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-[var(--hairline-soft)] bg-[var(--surface)]/50 px-3 py-2 md:grid-cols-5">
        {[
          { label: 'Điểm kiếm được', value: `+${kpi.total}`, tone: 'text-emerald-600' },
          { label: 'Ngày có dữ liệu', value: String(kpi.dates) },
          { label: 'Trung bình / ngày', value: `+${kpi.avg}` },
          { label: 'Lượt chạy', value: String(kpi.runs) },
          { label: 'Cảnh báo', value: String(kpi.warn), tone: kpi.warn ? 'text-[var(--error)]' : '' }
        ].map((k) => (
          <div key={k.label} className="rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-1.5">
            <div className="text-[11.5px] uppercase tracking-wide text-[var(--stone)]">{k.label}</div>
            <div className={`mm-tabular text-[18px] font-semibold leading-tight ${k.tone ?? ''}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Biểu đồ */}
      <div className="shrink-0 border-b border-[var(--hairline-soft)] bg-[var(--canvas)]">
        <div className="flex items-center gap-2 px-3 pt-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--steel)]">
          <BarChart3 className="size-3.5" /> Điểm kiếm được theo ngày
          {profileId ? '' : ' (xếp chồng theo tài khoản)'}
        </div>
        <DailyChart rows={rows} profiles={data?.profiles ?? []} />
      </div>

      {/* Bảng.
          BUG 2026-10-16: cot de width co dinh (px) + cot cuoi khong co width => cua so rong thi cot van nho,
          moi khoang trong don het vao cot "Chi tiet". Fix: table-fixed + width theo % de cot tu gian theo be rong. */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Table data-slot="history-table" className="w-full min-w-[1100px] table-fixed">
          <TableHeader>
            <TableRow className="hover:bg-[var(--surface)]">
              <TableHead className="w-[7%]">Ngày</TableHead>
              <TableHead className="w-[16%]">Tài khoản</TableHead>
              <TableHead className="w-[12%]">Search desktop</TableHead>
              <TableHead className="w-[11%]">Search mobile</TableHead>
              <TableHead className="w-[11%]">Daily set</TableHead>
              <TableHead className="w-[11%]">Keep earning</TableHead>
              <TableHead className="w-[12%]">Điểm trong ngày</TableHead>
              <TableHead className="w-[7%]">Lượt chạy</TableHead>
              <TableHead className="w-[13%]">Chi tiết</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="py-12 text-center text-[var(--steel)]">
                  <CalendarDays className="mx-auto mb-2 size-5 text-[var(--stone)]" />
                  Chưa có dữ liệu lịch sử trong khoảng này. Chạy 1 lượt (hoặc bật chế độ tự động) rồi quay lại.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const key = `${r.date}|${r.profileId}`
                const open = openRow === key
                return (
                  <>
                    <TableRow key={key} className={open ? 'bg-[var(--surface)]' : undefined}>
                      <TableCell>
                        <div className="mm-tabular font-medium">{dayLabel(r.date)}</div>
                        <div className="mm-micro">
                          {dowLabel(r.date)} · {r.date.slice(0, 4)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="truncate font-medium">{r.name}</div>
                        <div className="mm-micro truncate">{r.account}</div>
                      </TableCell>
                      <TableCell>
                        <TaskCell t={r.desktop} unit="search" />
                      </TableCell>
                      <TableCell>
                        <TaskCell t={r.mobile} unit="search" />
                      </TableCell>
                      <TableCell>
                        <TaskCell t={r.daily} unit="link" />
                      </TableCell>
                      <TableCell>
                        <TaskCell t={r.earn} unit="link" />
                      </TableCell>
                      <TableCell>
                        <div className="mm-tabular text-[13px] font-semibold text-emerald-600">
                          {r.gained != null ? `+${r.gained}` : '—'}
                        </div>
                        <div className="mm-micro mm-tabular">
                          {fmt(r.pointsFirst)} → {fmt(r.pointsLast)}
                        </div>
                      </TableCell>
                      <TableCell className="mm-tabular">{r.runs.length}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            variant="tertiary"
                            className="h-6 gap-1 px-2 text-[11.5px]"
                            onClick={() => setOpenRow(open ? null : key)}
                          >
                            <ChevronDown className={open ? 'size-3 rotate-180 transition' : 'size-3 transition'} />
                            {r.runs.length} lượt
                          </Button>
                          {r.warnings.length ? (
                            <Badge variant="warning" className="gap-1">
                              <TriangleAlert className="size-3" /> {r.warnings.length}
                            </Badge>
                          ) : (
                            <Badge variant="success" className="gap-1">
                              <Check className="size-3" /> sạch
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow key={`${key}-detail`} className="hover:bg-transparent">
                        <TableCell colSpan={9} className="bg-[var(--surface)]/40 p-0">
                          <div className="grid gap-3 p-3 md:grid-cols-2">
                            {/* Cột 1: các lượt chạy */}
                            <div>
                              <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                                <Info className="size-3.5" /> Các lượt chạy trong ngày
                              </div>
                              {r.runs.length === 0 ? (
                                <div className="text-[12px] text-[var(--stone)]">Không có lượt chạy nào được ghi.</div>
                              ) : (
                                <div className="flex flex-col gap-1">
                                  {r.runs.map((run, i) => (
                                    <div
                                      key={`${run.at}-${run.kind}-${i}`}
                                      className="flex items-center gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--canvas)] px-2 py-1"
                                    >
                                      <span className="mm-tabular shrink-0 text-[11.5px] text-[var(--stone)]">
                                        {new Date(run.at).toLocaleTimeString('vi-VN').slice(0, 5)}
                                      </span>
                                      <Badge variant="outline">{run.kind}</Badge>
                                      {run.searches != null ? <span className="mm-micro">{run.searches} search</span> : null}
                                      <span className="mm-micro mm-tabular ml-auto">
                                        {fmt(run.pointsBefore)} → {fmt(run.pointsAfter)}
                                        {run.gained != null ? ` (${run.gained >= 0 ? '+' : ''}${run.gained})` : ''}
                                      </span>
                                      <span
                                        className={
                                          'shrink-0 text-[11px] ' +
                                          (run.status === 'done' || run.status === 'credited'
                                            ? 'text-[var(--success-text)]'
                                            : 'text-[var(--error)]')
                                        }
                                      >
                                        {run.status}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {r.warnings.length ? (
                                <div className="mt-2 rounded-[8px] border border-[#f3d3d3] bg-[#fdf2f2] px-2 py-1.5 text-[11.5px] text-[var(--error)]">
                                  {r.warnings.join(' · ')}
                                </div>
                              ) : null}
                            </div>

                            {/* Cột 2: daily set + keep earning đã bấm */}
                            <div className="flex flex-col gap-2">
                              {(
                                [
                                  ['Daily set', r.daily] as const,
                                  ['Keep earning', r.earn] as const
                                ]
                              ).map(([title, t]) => (
                                <div key={title}>
                                  <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                                    {title} — {t.done}/{t.total ?? '?'} · {fmt(t.gained)} điểm
                                  </div>
                                  {t.items.length === 0 ? (
                                    <div className="text-[12px] text-[var(--stone)]">Không có mục nào.</div>
                                  ) : (
                                    <div className="flex flex-col gap-1">
                                      {t.items.map((it, i) => (
                                        <div key={i} className="flex items-start gap-2 text-[12px]">
                                          <span className={it.visited ? 'text-[var(--success-text)]' : 'text-[var(--stone)]'}>
                                            {it.visited ? '✓' : '○'}
                                          </span>
                                          <span className="min-w-0 flex-1 truncate" title={it.label}>
                                            {it.label}
                                          </span>
                                          {it.reward ? <span className="mm-micro shrink-0">+{it.reward}</span> : null}
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                              <Button
                                size="sm"
                                variant="tertiary"
                                className="mt-1 w-fit gap-1.5 text-[11.5px]"
                                onClick={async () => {
                                  await navigator.clipboard
                                    .writeText(JSON.stringify({ day: r.date, profile: r.name, runs: r.runs, daily: r.daily.items, earn: r.earn.items }, null, 2))
                                    .catch(() => {})
                                  toast.success('Đã copy JSON chi tiết ngày này (gửi cho agent nếu cần phân tích).')
                                }}
                              >
                                <Copy className="size-3" /> Copy JSON ngày này
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="shrink-0 border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--steel)]">
        Lịch sử đọc từ <span className="font-mono">state/&lt;tài khoản&gt;.json</span> — mỗi ngày ghi lại: số search, điểm
        trước/sau từng task, danh sách link daily set / keep earning đã bấm và mọi lượt chạy. Dữ liệu giữ theo ngày nên
        xem lại được các hôm trước.
      </div>
    </div>
  )
}
