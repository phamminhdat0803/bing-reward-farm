import { Fragment, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, CalendarDays, Check, ChevronDown, Copy, Download, Info, RefreshCw, TriangleAlert, Search, Users, Coins, TrendingUp, Play, Eye, X } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { Input } from '@renderer/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@renderer/components/ui/dropdown-menu'
import type { HistoryData, HistoryDay, HistoryTask } from '@shared/types'

const RANGES = [
  { label: '7 ngày', days: 7 },
  { label: '14 ngày', days: 14 },
  { label: '30 ngày', days: 30 },
  { label: 'Tất cả', days: 0 }
]

const PROFILE_COLORS = ['var(--brand-blue-deep)', '#22b8a6', '#f0a13a', '#a06bf0', '#e5527a', '#5b8def', '#3fa66a']
const fmt = (n: number | null | undefined): string => (n == null ? '—' : String(n))
const dayLabel = (d: string): string => {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}
const dowLabel = (d: string): string => ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][new Date(`${d}T00:00:00`).getDay()]

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
  const H = 120
  const padL = 44
  const padB = 26
  const padT = 12
  const max = Math.max(30, ...byDate.map((d) => d.total))
  const bw = Math.max(10, Math.min(46, (W - padL - 12) / byDate.length - 8))
  const colors = PROFILE_COLORS

  return (
    <div className="relative px-3 pt-2 pb-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" role="img" aria-label="Điểm kiếm được theo ngày, xếp chồng theo tài khoản" preserveAspectRatio="none">
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

function TaskCell({ t, kind }: { t: HistoryTask; kind: 'desktop' | 'mobile' | 'daily' | 'earn' }): React.JSX.Element {
  const has = t.done > 0 || (t.gained ?? 0) > 0
  const search = kind === 'desktop' || kind === 'mobile'
  const colors = { desktop: 'bg-blue-50 text-blue-700', mobile: 'bg-violet-50 text-violet-700', daily: 'bg-emerald-50 text-emerald-700', earn: 'bg-amber-50 text-amber-700' }
  const complete = !search && t.total != null && t.total > 0 && t.done >= t.total
  return (
    <div className="flex h-11 min-w-0 flex-col justify-center gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`mm-tabular inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11.5px] font-medium ${has ? colors[kind] : 'bg-[var(--surface)] text-[var(--stone)]'}`}>
          {complete ? <Check className="size-3 shrink-0" /> : null}{t.done}{!search && t.total != null ? `/${t.total}` : ''} {search ? 'search' : 'mục'}
        </span>
      </div>
      <span className={`mm-tabular truncate text-[11px] ${(t.gained ?? 0) > 0 ? 'font-medium text-emerald-700' : 'text-[var(--stone)]'}`}>
        {t.gained != null ? `${t.gained > 0 ? '+' : ''}${t.gained} điểm` : 'Chưa ghi nhận điểm'}
      </span>
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
  const [showChart, setShowChart] = useState(true)
  const [openRow, setOpenRow] = useState<string | null>(null)

  const load = async (days = rangeDays, pid = profileId): Promise<void> => {
    setBusy(true)
    try {
      setData(await window.api.listHistory({ days, profileId: pid || undefined }))
    } catch {
      toast.error('Không tải được lịch sử. Vui lòng thử làm mới.')
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
      {/* Thanh công cụ cố định, các bộ lọc không đẩy bảng khi thay đổi. */}
      <div data-slot="history-toolbar" className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--hairline-soft)] px-3 [&>*]:shrink-0">
        <div className="flex items-center gap-0.5 rounded-full border border-[var(--hairline)] bg-[var(--surface)] p-0.5" role="group" aria-label="Khoảng thời gian">
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={rangeDays === r.days} onClick={() => setRangeDays(r.days)} className={`h-7 rounded-full px-3 text-[12px] transition-colors ${rangeDays === r.days ? 'bg-[var(--primary)] font-medium text-white' : 'text-[var(--steel)] hover:bg-[var(--canvas)]'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="w-[190px] gap-1.5" title="Lọc tài khoản">
              <Users className="size-3.5 shrink-0" /><span className="min-w-0 flex-1 truncate text-left">{data?.profiles.find((p) => p.id === profileId)?.name ?? 'Tất cả tài khoản'}</span><ChevronDown className="size-3 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            {[{ id: '', name: 'Tất cả tài khoản' }, ...(data?.profiles ?? [])].map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => setProfileId(p.id)} className="gap-2"><Check className={`size-3.5 ${profileId === p.id ? '' : 'invisible'}`} />{p.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="relative w-[210px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--stone)]" />
          <Input className="h-8 pl-8 pr-7 text-[12px]" placeholder="Tìm ngày, tài khoản, lỗi…" aria-label="Tìm lịch sử" value={query} onChange={(e) => setQuery(e.target.value)} />
          {query ? <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--stone)]" aria-label="Xoá tìm kiếm" onClick={() => setQuery('')}><X className="size-3.5" /></button> : null}
        </div>
        <Button size="sm" variant={onlyWarn ? 'secondary' : 'tertiary'} aria-pressed={onlyWarn} className={`gap-1.5 ${onlyWarn ? 'bg-amber-50 text-amber-700' : ''}`} onClick={() => setOnlyWarn(!onlyWarn)}><TriangleAlert className="size-3.5" />Có cảnh báo</Button>
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" variant="tertiary" className="gap-1.5" disabled={busy} onClick={() => void load()}><RefreshCw className={busy ? 'size-3.5 animate-spin' : 'size-3.5'} />Làm mới</Button>
          <Button size="sm" variant="tertiary" className="gap-1.5" disabled={!rows.length} onClick={() => void exportCsv()}><Download className="size-3.5" />Copy CSV</Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid shrink-0 grid-cols-2 gap-2 border-b border-[var(--hairline-soft)] bg-[var(--surface)]/50 px-3 py-2 md:grid-cols-5">
        {[
          { label: 'Điểm kiếm được', value: `+${kpi.total}`, tone: 'text-emerald-700', icon: Coins, bg: 'bg-emerald-50' },
          { label: 'Ngày có dữ liệu', value: String(kpi.dates), tone: 'text-blue-700', icon: CalendarDays, bg: 'bg-blue-50' },
          { label: 'Trung bình / ngày', value: `+${kpi.avg}`, tone: 'text-teal-700', icon: TrendingUp, bg: 'bg-teal-50' },
          { label: 'Lượt chạy', value: String(kpi.runs), tone: 'text-violet-700', icon: Play, bg: 'bg-violet-50' },
          { label: 'Cảnh báo', value: String(kpi.warn), tone: kpi.warn ? 'text-amber-700' : 'text-[var(--steel)]', icon: TriangleAlert, bg: 'bg-amber-50' }
        ].map((k) => (
          <div key={k.label} className="flex items-center gap-2.5 rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] px-3 py-2">
            <span className={`flex size-8 shrink-0 items-center justify-center rounded-full ${k.bg} ${k.tone}`}><k.icon className="size-4" /></span>
            <div><div className="text-[11.5px] text-[var(--steel)]">{k.label}</div>
            <div className={`mm-tabular text-[18px] font-semibold leading-tight ${k.tone ?? ''}`}>{k.value}</div></div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-b border-[var(--hairline-soft)] bg-[var(--canvas)]">
        <div className="flex h-9 items-center gap-2 px-3 text-[12px] text-[var(--steel)]">
          <BarChart3 className="size-3.5 text-[var(--brand-blue-deep)]" /><span className="font-semibold">Điểm theo ngày</span>
          <span className="text-[11px] text-[var(--stone)]">{kpi.dates} ngày có dữ liệu</span>
          <Button size="sm" variant="tertiary" className="ml-auto h-6 gap-1 px-2 text-[11px]" aria-expanded={showChart} aria-controls="history-chart" onClick={() => setShowChart(!showChart)}><ChevronDown className={`size-3 transition-transform ${showChart ? 'rotate-180' : ''}`} />{showChart ? 'Thu biểu đồ' : 'Xem biểu đồ'}</Button>
        </div>
        {showChart ? <div id="history-chart">
          <DailyChart rows={rows} profiles={data?.profiles ?? []} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2 text-[11px] text-[var(--steel)]">
            {(data?.profiles ?? []).filter((p) => rows.some((r) => r.profileId === p.id)).map((p) => <span key={p.id} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: PROFILE_COLORS[(data?.profiles ?? []).findIndex((x) => x.id === p.id) % PROFILE_COLORS.length] }} />{p.name}</span>)}
          </div>
        </div> : null}
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
                  <Fragment key={key}>
                    <TableRow data-slot="history-summary-row" className={`h-14 [&>td]:py-1 ${open ? 'bg-blue-50/50' : ''}`}>
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
                        <TaskCell t={r.desktop} kind="desktop" />
                      </TableCell>
                      <TableCell>
                        <TaskCell t={r.mobile} kind="mobile" />
                      </TableCell>
                      <TableCell>
                        <TaskCell t={r.daily} kind="daily" />
                      </TableCell>
                      <TableCell>
                        <TaskCell t={r.earn} kind="earn" />
                      </TableCell>
                      <TableCell>
                        <div className="mm-tabular text-[13px] font-semibold text-emerald-600">
                          {r.gained != null ? `+${r.gained}` : '—'}
                        </div>
                        <div className="mm-micro mm-tabular">
                          {fmt(r.pointsFirst)} → {fmt(r.pointsLast)}
                        </div>
                      </TableCell>
                      <TableCell className="mm-tabular"><Badge variant="secondary" className="bg-violet-50 text-violet-700">{r.runs.length} lượt</Badge></TableCell>
                      <TableCell>
                        <div className="flex h-11 flex-col items-start justify-center gap-1">
                          <Button
                            size="sm"
                            variant="tertiary"
                            className="h-6 gap-1 border-[var(--hairline)] px-2 text-[11px] text-[var(--brand-blue-deep)]"
                            aria-expanded={open}
                            aria-label={`Chi tiết ${r.name} ngày ${r.date}`}
                            onClick={() => setOpenRow(open ? null : key)}
                          >
                            <Eye className="size-3" />{open ? 'Thu chi tiết' : 'Xem chi tiết'}
                          </Button>
                          {r.warnings.length ? (
                            <Badge variant="warning" className="h-4 gap-1 px-1.5 text-[10px]">
                              <TriangleAlert className="size-3" /> {r.warnings.length} cảnh báo
                            </Badge>
                          ) : (
                            <Badge variant="success" className="h-4 gap-1 px-1.5 text-[10px]">
                              <Check className="size-3" /> Không cảnh báo
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                    {open ? (
                      <TableRow key={`${key}-detail`} className="hover:bg-transparent">
                        <TableCell colSpan={9} className="bg-[var(--surface)]/40 p-0">
                          <div className="grid gap-3 p-3 lg:grid-cols-2">
                            {/* Cột 1: các lượt chạy */}
                            <div className="min-w-0 rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-3">
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
                                      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-[var(--surface)] px-2 py-1.5"
                                    >
                                      <span className="mm-tabular shrink-0 text-[11.5px] text-[var(--stone)]">
                                        {new Date(run.at).toLocaleTimeString('vi-VN').slice(0, 5)}
                                      </span>
                                      <Badge variant="secondary" className={run.kind === 'desktop' ? 'bg-blue-50 text-blue-700' : run.kind === 'mobile' ? 'bg-violet-50 text-violet-700' : run.kind === 'daily' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>
                                        {{ desktop: 'Desktop', mobile: 'Mobile', daily: 'Daily set', earn: 'Keep earning' }[run.kind] ?? run.kind}
                                      </Badge>
                                      {run.searches != null ? <span className="mm-micro">{run.searches} search</span> : null}
                                      <span className="mm-micro mm-tabular ml-auto">
                                        {fmt(run.pointsBefore)} → {fmt(run.pointsAfter)}
                                        {run.gained != null ? ` (${run.gained >= 0 ? '+' : ''}${run.gained})` : ''}
                                      </span>
                                      <Badge variant={run.status === 'done' || run.status === 'credited' ? 'success' : 'warning'} className="h-5 text-[10.5px]" title={run.status}>
                                        {run.status === 'done' ? 'Hoàn tất' : run.status === 'credited' ? 'Đã cộng điểm' : run.status}
                                      </Badge>
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
                            <div className="min-w-0 rounded-2xl border border-[var(--hairline)] bg-[var(--canvas)] p-3 flex flex-col gap-3">
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
                  </Fragment>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="mm-tabular flex h-8 shrink-0 items-center justify-between gap-3 overflow-hidden whitespace-nowrap border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 text-[11.5px] text-[var(--steel)]">
        <span>{rows.length} bản ghi · {kpi.dates} ngày · {new Set(rows.map((r) => r.profileId)).size} tài khoản</span>
        <span className="text-[var(--stone)]">{busy ? 'Đang tải…' : data?.at ? `Cập nhật ${new Date(data.at).toLocaleTimeString('vi-VN').slice(0, 5)}` : 'Chưa tải dữ liệu'}</span>
      </div>
    </div>
  )
}
