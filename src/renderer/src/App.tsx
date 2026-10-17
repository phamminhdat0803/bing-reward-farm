import { proxyTestCandidates } from '@shared/proxy-testing'
import { KeywordsPanel } from '@renderer/components/KeywordsPanel'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Settings2, MonitorCog, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { AppSettings, LogLine, Profile, ProxyItem, RefreshProgress, RowState } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@renderer/components/ui/dropdown-menu'
import { Switch } from '@renderer/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@renderer/components/ui/select'
import { AppToolbar } from '@renderer/components/AppToolbar'
import { AccountsTable } from '@renderer/components/AccountsTable'
import { AccountDialog } from '@renderer/components/AccountDialog'
import { AccountDrawer } from '@renderer/components/AccountDrawer'
import { BrowsersDialog } from '@renderer/components/BrowsersDialog'
import { ConfirmDialog, type ConfirmRequest } from '@renderer/components/ConfirmDialog'
import { ProxyPanel } from '@renderer/components/ProxyPanel'
import { PhonePanel } from '@renderer/components/PhonePanel'
import { HistoryPanel } from '@renderer/components/HistoryPanel'
import { SettingsPanel } from '@renderer/components/SettingsPanel'

import { ProxyTestFab, type ProxyTestState } from '@renderer/components/ProxyTestFab'
import { LogDock } from '@renderer/components/LogDock'
import { StatStrip } from '@renderer/components/StatStrip'
import { Toaster } from '@renderer/components/ui/sonner'
import { fmtNum } from '@renderer/lib/utils'
import { selectAccount, toggleVisibleAccounts, type AccountSelectionIntent } from '@renderer/lib/account-selection'

export default function App(): React.JSX.Element {
  const [rows, setRows] = useState<RowState[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectionAnchor = useRef<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  /** Tien do search truc tiep theo profile (day tu main moi search) */
  const [progress, setProgress] = useState<
    Record<string, { kind: string; done: number; total: number; points: number | null; today: number | null; gained: number }>
  >({})
  const [busy, setBusy] = useState<string | null>(null)
  /** Lệnh đang chờ của TỪNG acc (cùng acc chạy tuần tự) */
  const [queue, setQueue] = useState<{ profileId: string; name: string; pending: number; oldestWaitMs?: number }[]>([])
  /** Acc phải chờ slot (chỉ khi bật giới hạn tổng) */
  const [waiting, setWaiting] = useState<{ profileId: string; name: string; position: number }[]>([])
  /** 0 = không giới hạn tổng (các acc chạy song song) */
  const [queueMax, setQueueMax] = useState(0)
  const [refreshing, setRefreshing] = useState<{ done: number; total: number; parallel?: number } | null>(null)
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(() => new URLSearchParams(location.search).get('drawer') === '1')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [browsersOpen, setBrowsersOpen] = useState(() => new URLSearchParams(location.search).get('browsers') === '1')
  const [browserCount, setBrowserCount] = useState(0)
  const [tab, setTab] = useState<'accounts' | 'proxies' | 'phone' | 'history' | 'settings' | 'keywords'>(
    () => {
      const t = new URLSearchParams(location.search).get('tab')
      return t === 'keywords' || t === 'proxies' || t === 'phone' || t === 'history' || t === 'settings' ? t : 'accounts'
    }
  )
  const [phoneAppCount, setPhoneAppCount] = useState(0)
  /** Trạng thái chế độ tự động (chu kỳ, vòng đã chạy, lần chạy tới) */
  const [auto, setAuto] = useState<{
    cycles: number
    running: boolean
    lastCycleAt: string | null
    lastCycleResult: string | null
    nextAt: string | null
    remediations: number
    everyMs: number
    enabled: boolean
  } | null>(null)
  const [escalations, setEscalations] = useState<
    { file: string; profile: string; task: string; tries: number; at: string; summary: string }[]
  >([])
  const [proxyCount, setProxyCount] = useState(0)
  const [proxies, setProxies] = useState<ProxyItem[]>([])
  /** proxyId -> suc khoe proxy (de hien IP ra / trang thai ngay tren bang) */
  const [proxyHealth, setProxyHealth] = useState<
    Record<string, { status: string; ip?: string; country?: string; latency?: number; error?: string; checkedAt: string }>
  >({})
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  /** Tiến độ kiểm tra proxy theo lô — để ở App nên chuyển tab qua lại không mất */
  const [proxyTest, setProxyTest] = useState<ProxyTestState | null>(null)

  const activeRow = useMemo(() => rows.find((r) => r.id === activeId) ?? null, [rows, activeId])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(
      (r) =>
        r.profile.name.toLowerCase().includes(q) ||
        (r.profile.account ?? '').toLowerCase().includes(q) ||
        r.profile.id.toLowerCase().includes(q)
    )
  }, [rows, query])

  const reload = useCallback(async (): Promise<void> => {
    const list = await window.api.listState()
    setRows(list)
    const ids = new Set(list.map(row => row.id))
    setSelectedIds(current => current.every(id => ids.has(id)) ? current : current.filter(id => ids.has(id)))
    setActiveId(current => current && ids.has(current) ? current : new URLSearchParams(location.search).get('drawer') === '1' ? list[0]?.id ?? null : null)
  }, [])

  useEffect(() => {
    if (tab !== 'accounts') setDrawerOpen(false)
  }, [tab])

  useEffect(() => {
    // Mo app: CHI doc cache, KHONG mo trinh duyet
    void reload()
    void window.api.getSettings().then(setSettingsState)
    void window.api.detectBrowsers().then((l) => setBrowserCount(l.filter((b) => b.chromium).length))
    void window.api.listProxies().then((l) => {
      setProxyCount(l.length)
      setProxies(l)
    })
    void window.api.proxyHealth?.().then(setProxyHealth).catch(() => {})
    void window.api.runQueue?.().then((q) => {
      setQueue(q.items)
      setWaiting(q.waiting)
      setQueueMax(q.max)
    })
    const offQueue = window.api.onRunQueue?.((p) => {
      setQueue(p.items)
      setWaiting(p.waiting)
      setQueueMax(p.max)
    })
    const offHealth = window.api.onHealthChanged?.(() => {
      void window.api.proxyHealth?.().then(setProxyHealth).catch(() => {})
    })
    const healthTimer = window.setInterval(
      () => void window.api.proxyHealth?.().then(setProxyHealth).catch(() => {}),
      30000
    )
    const offLog = window.api.onLog((line) => {
      setLogs((prev) => [...prev.slice(-400), line])
      // Canh bao noi bat khi profile bi dung vi toan bo proxy deu chet (khong fallback DIRECT)
      if (line.msg && line.msg.includes('DUNG profile')) {
        toast.error('Đã dừng tài khoản: toàn bộ proxy đều chết', {
          description: 'Không chạy bằng IP thật (no-direct đang BẬT). Kiểm tra proxy hoặc thêm proxy dự phòng.'
        })
      }
    })
    const offSnap = window.api.onSnapshot(() => void reload())
    const offProxyTest = window.api.onTestProgress?.((p) =>
      setProxyTest({ done: p.done, total: p.total, ok: p.ok, error: p.error })
    )
    const offProg = window.api.onRefreshProgress((p: RefreshProgress) => {
      if (p.done >= p.total) {
        setRefreshing({ done: p.done, total: p.total, parallel: p.parallel })
        setTimeout(() => {
          setRefreshing((cur) => (cur && cur.done >= cur.total ? null : cur))
          setRefreshingId(null)
        }, 500)
      } else {
        setRefreshing({ done: p.done, total: p.total, parallel: p.parallel })
        if (p.profileId) setRefreshingId(p.profileId)
      }
    })
    const offRefreshDone = window.api.onRefreshDone?.(() => {
      setRefreshing(null)
      setRefreshingId(null)
    })
    const offRun = window.api.onRunStatus((s) => {
      // Xoa tien do cu cua acc khi luot chay bat dau/ket thuc, tranh hien nham
      // (vd chi chay "Kiem them" ma van con so 'Desktop 9/9' cua luot truoc)
      if (s && s.profileId) {
        setProgress((prev) => {
          if (!(s.profileId in prev)) return prev
          const next = { ...prev }
          delete next[s.profileId]
          return next
        })
      }
      void reload()
    })
    const offRunProg = window.api.onRunProgress((p) => setProgress((prev) => ({ ...prev, [p.profileId]: p })))
    const offBrowser = window.api.onBrowserState?.((p) => {
      // Nguoi dung dong cua so trinh duyet -> xoa tien do cua acc do va tai lai bang
      setProgress((prev) => {
        if (!(p.profileId in prev)) return prev
        const next = { ...prev }
        delete next[p.profileId]
        return next
      })
      void reload()
    })
    const timer = window.setInterval(() => void reload(), 60000)
    return () => {
      offLog()
      offSnap()
      offProg()
      offProxyTest?.()
      offRefreshDone?.()
      offRun()
      offRunProg()
      offBrowser?.()
      offQueue?.()
      offHealth?.()
      window.clearInterval(healthTimer)
      window.clearInterval(timer)
    }
  }, [reload])

  useEffect(() => {
    // Do thiet bi THAT khi mo app (adb nhanh, KHONG mo trinh duyet) de badge khong hien so lieu cu
    void window.api
      .detectPhoneApps()
      .then((s) => setPhoneAppCount(s.devices.filter((d) => d.status === 'online').length))
      .catch(() => {})
    void window.api.autoStatus().then(setAuto).catch(() => {})
    void window.api.autoEscalations().then(setEscalations).catch(() => {})
    const off = window.api.onAutoChanged(() => {
      void window.api.autoStatus().then(setAuto).catch(() => {})
      void window.api.autoEscalations().then(setEscalations).catch(() => {})
    })
    return off
  }, [])

  /** Mở hộp hồ sơ cần agent phân tích: copy đường dẫn file JSON để đưa cho agent */
  const openEscalations = async (): Promise<void> => {
    const list = await window.api.autoEscalations()
    setEscalations(list)
    if (!list.length) {
      toast.info('Chưa có hồ sơ nào — chỉ ghi khi 1 điểm chạy 3 lần vẫn không lên.')
      return
    }
    const first = list[0]
    await navigator.clipboard.writeText(list.map((e) => e.file).join('\n')).catch(() => {})
    toast.info(
      `Đã copy ${list.length} đường dẫn hồ sơ. Gần nhất: ${first.profile}/${first.task} (${first.tries} lần không lên) — dán cho agent kèm file này.`,
      { duration: 9000 }
    )
  }

  const runningRows = useMemo(() => rows.filter((r) => r.run.running), [rows])

  /** Chạy kiểm tra proxy theo lô — state ở App nên đổi tab vẫn thấy tiến độ. */
  const runProxyTest = async (ids?: string[]): Promise<void> => {
    if (proxyTest) {
      toast.info('Đang có lượt kiểm tra proxy chạy — chờ xong hoặc bấm Dừng.')
      return
    }
    setProxyTest({ done: 0, total: 0, ok: 0, error: 0 })
    try {
      const latest = await window.api.listProxies()
      setProxies(latest)
      const candidates = proxyTestCandidates(latest, ids)
      if (!candidates.length) {
        toast.info('Không có proxy được phép kiểm tra (đã bỏ qua blacklist/không dùng).')
        return
      }
      setProxyTest({ done: 0, total: candidates.length, ok: 0, error: 0 })
      const res = await window.api.testAllProxies(candidates.map(p => p.id))
      const ok = Object.values(res).filter((r) => r.ok).length
      toast.success(`Kiểm tra xong: ${ok}/${Object.keys(res).length} proxy hoạt động`)
    } catch (e) {
      toast.error(String((e as Error).message).slice(0, 200))
    } finally {
      try {
        const l = await window.api.listProxies()
        setProxies(l)
        setProxyCount(l.length)
      } catch { /* Giữ danh sách hiện tại nếu tải lại thất bại. */ }
      setProxyTest(null)
    }
  }

  const anyRunning = rows.some((r) => r.run.running)

  const act = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(String((e as Error).message).slice(0, 200))
    } finally {
      setBusy(null)
    }
  }

  const refreshPoints = (ids: string[]): Promise<void> =>
    act('refresh', async () => {
      if (!ids.length) return
      setRefreshing({ done: 0, total: ids.length })
      if (ids.length === 1) setRefreshingId(ids[0])
      toast.info(`Đang mở trình duyệt để lấy điểm cho ${ids.length} tài khoản…`)
      try {
        await window.api.refreshPoints(ids)
        await reload()
        toast.success('Đã cập nhật số liệu mới.')
      } catch (e) {
        toast.error(`Cập nhật thất bại: ${String((e as Error).message).slice(0, 200)}`)
      } finally {
        setTimeout(() => {
          setRefreshing(null)
          setRefreshingId(null)
        }, 300)
      }
    })

  const withBrowser = (id: string, action: 'open' | 'close'): Promise<void> =>
    act(`browser:${id}`, async () => {
      if (action === 'open') {
        const r = await window.api.openBrowser(id)
        if (!r.ok) throw new Error(r.error ?? 'không mở được trình duyệt')
        toast.success(`Đã mở trình duyệt (CDP ${r.cdpUrl})`)
      } else {
        const r = await window.api.closeBrowser(id)
        if (r.ok === false) throw new Error(r.error ?? 'không đóng được trình duyệt')
        toast.success('Đã đóng trình duyệt.')
      }
      await reload()
    })

  const runKinds = (ids: string[], kinds: string[]): Promise<void> =>
    act('run', async () => {
      setLogs([])
      for (const id of ids) {
        const res = await window.api.startRun(id, kinds)
        if (!res.ok) throw new Error(res.error ?? 'không chạy được')
      }
      toast.info(`Bắt đầu chạy: ${kinds.join(' + ')}`)
      await reload()
    })

  const stopRunSingle = (id: string): Promise<void> =>
    act(`stop:${id}`, async () => {
      await window.api.stopRun(id)
      toast.info('Đã dừng chạy tài khoản này.')
      await reload()
    })

  const targetIds = selectedIds
  const selectedRows = rows.filter(row => targetIds.includes(row.id))
  const hiddenSelectedCount = targetIds.filter(id => !filtered.some(row => row.id === id)).length
  const detailIndex = filtered.findIndex(row => row.id === activeId)
  const selectRow = (id: string, intent?: AccountSelectionIntent): void => {
    const next = selectAccount(selectedIds, filtered.map(row => row.id), id, selectionAnchor.current, intent)
    selectionAnchor.current = next.anchor
    setSelectedIds(next.ids)
  }
  const clearSelection = (): void => { setSelectedIds([]); selectionAnchor.current = null }

  // Mỗi lúc chỉ mở MỘT lớp phủ (dialog / drawer / trình duyệt) — tránh Radix giữ focus chéo
  const openAccountDialog = (profile: Profile | null): void => {
    setDrawerOpen(false)
    setBrowsersOpen(false)
    setEditing(profile)
    setDialogOpen(true)
  }
  const openDrawer = (id: string): void => {
    setDialogOpen(false)
    setBrowsersOpen(false)
    setActiveId(id)
    setDrawerOpen(true)
  }
  const openBrowsers = (): void => {
    setDialogOpen(false)
    setDrawerOpen(false)
    setBrowsersOpen(true)
  }

  /** Hỏi rồi xoá tài khoản khỏi danh sách (dùng cho toolbar + menu chuột phải). */
  const confirmRemove = (ids: string[]): void => {
    if (!ids.length) return
    setDrawerOpen(false)
    setConfirm({
      title: ids.length === 1 ? 'Xoá tài khoản khỏi danh sách?' : `Xoá ${ids.length} tài khoản khỏi danh sách?`,
      description: 'Chỉ xoá khỏi danh sách quản lý — KHÔNG xoá thư mục profile, nên có thể thêm lại sau.',
      confirmLabel: 'Xoá khỏi danh sách',
      danger: true,
      onConfirm: async () => {
        for (const id of ids) await window.api.removeProfile(id)
        setSelectedIds(current => current.filter(id => !ids.includes(id)))
        setActiveId(current => current && ids.includes(current) ? null : current)
        await reload()
        toast.success(`Đã xoá ${ids.length} tài khoản khỏi danh sách.`)
      }
    })
  }

  return (
    <div className="flex h-full flex-col bg-[var(--canvas)]">
      {/* Promo banner kiểu MiniMax.
          BUG 2026-10-16: truoc day la flex justify-center -> khi chip "tu dong" xuat hien / doi noi dung
          (dang chay <-> toi HH:MM) thi ca dong bi day ngang, va lech line-height lam thanh tren CAO/THAP
          nhap nhay. Fix: luoi 3 cot (1fr - auto - 1fr) + chieu cao CO DINH + so tabular + chip co min-width. */}
      <div data-slot="promo-bar" className="grid h-8 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 overflow-hidden bg-[var(--primary)] px-4 text-[12.5px] font-medium leading-none text-white">
        <div className="min-w-0" />
        <div className="mm-tabular whitespace-nowrap">
          Hôm nay đã kiếm <strong className="font-semibold">{fmtNum(rows.reduce((s, r) => s + (r.cache?.todayPoints ?? 0), 0))}</strong>{' '}
          điểm · {rows.length} tài khoản · {rows.filter((r) => r.browser.running).length} trình duyệt đang mở
        </div>
        <div className="flex min-w-0 items-center justify-end gap-2 overflow-hidden">
          {escalations.length ? (
            <button
              type="button"
              onClick={() => void openEscalations()}
              className="shrink-0 rounded-full bg-[var(--brand-coral)] px-[10px] py-[2px] text-[12px] font-semibold text-white hover:brightness-110"
              title="Các điểm chạy mãi không lên — mở hồ sơ để đưa cho agent phân tích"
            >
              ⚠ {escalations.length} điểm cần phân tích
            </button>
          ) : null}
          {rows.some((r) => r.needsRefresh) ? (
            <span className="shrink-0 rounded-full bg-[var(--brand-coral)] px-[10px] py-[2px] text-[12px] font-semibold">
              có số liệu của hôm qua
            </span>
          ) : null}
          {auto?.enabled ? (
            <span
              className="mm-tabular flex min-w-[196px] shrink-0 items-center justify-center rounded-full bg-white/20 px-[10px] py-[2px] text-[12px] font-semibold"
              title={auto.lastCycleResult ?? 'chưa chạy vòng nào'}
            >
              ⏱ tự động {auto.everyMs === 3600000 ? '1 giờ' : auto.everyMs === 10800000 ? '3 giờ' : `${Math.round(auto.everyMs / 60000)} phút`} ·{' '}
              {auto.running ? 'đang chạy' : auto.nextAt ? `tới ${new Date(auto.nextAt).toLocaleTimeString('vi-VN').slice(0, 5)}` : 'chờ'}{' '}
              · {auto.cycles} vòng
            </span>
          ) : null}
        </div>
      </div>

      {/* Top nav */}
      <header className="flex items-center justify-between border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-4 py-2">
        <div className="flex items-center gap-3">
          <div className="flex size-8 items-center justify-center rounded-[10px] bg-[var(--primary)] text-[13px] font-semibold text-white">
            RF
          </div>
          <div>
            <div className="text-[14px] font-semibold leading-tight">Reward Farm</div>
            <div className="mm-micro">Quản lý tài khoản Microsoft Rewards</div>
          </div>
          <nav className="ml-3 hidden items-center gap-0.5 md:flex">
            {(
              [
                { id: 'accounts', label: 'Tài khoản' },
                { id: 'proxies', label: 'Proxy' },
                { id: 'phone', label: 'Điện thoại' },
                { id: 'history', label: 'Lịch sử' },
                { id: 'keywords', label: 'Từ khoá' },
                { id: 'settings', label: 'Cài đặt' }
              ] as const
            ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={
                    'rounded-full px-3 py-1 text-[12.5px] transition ' +
                    (tab === t.id
                      ? 'bg-[var(--surface)] font-medium text-[var(--ink)]'
                      : 'text-[var(--steel)] hover:bg-[var(--surface)]')
                  }
                >
                  {t.label}
                  {t.id === 'proxies' && proxyCount > 0 ? (
                    <span className="ml-1 text-[var(--stone)]">({proxyCount})</span>
                  ) : null}
                  {t.id === 'phone' && phoneAppCount > 0 ? (
                    <span className="ml-1 text-[var(--stone)]">({phoneAppCount})</span>
                  ) : null}
                </button>
              )
            )}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="tertiary" className="gap-1.5" onClick={openBrowsers}>
            <MonitorCog className="size-3.5" /> Trình duyệt
            {browserCount > 0 ? <span className="text-[var(--stone)]">({browserCount})</span> : null}
          </Button>

          {/* Gom moi dieu khien chay vao 1 nut: header khong bi vo chu khi cua so hep */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="tertiary" className="shrink-0 gap-1.5 whitespace-nowrap">
                <Settings2 className="size-3.5" /> Cài đặt chạy
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[356px] p-2">
              <DropdownMenuItem className="mb-1 gap-2" onSelect={() => setTab('settings')}><Settings2 className="size-3.5" /> Cài đặt kịch bản thông minh</DropdownMenuItem>
              <div className="grid gap-1">
                <div className="flex items-center justify-between gap-3 whitespace-nowrap rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-soft)]">
                  <span className="text-[12.5px]">Sang ngày mới tự lấy điểm</span>
                  <Switch
                    checked={settings?.autoRefreshOnNewDay ?? true}
                    onCheckedChange={async (v) => {
                      const next = await window.api.setSettings({ autoRefreshOnNewDay: v })
                      setSettingsState(next)
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 whitespace-nowrap rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-soft)]">
                  <span className="text-[12.5px]">Chạy ẩn (headless)</span>
                  <Switch
                    checked={settings?.runHeadless === true}
                    onCheckedChange={async (v) => {
                      const next = await window.api.setSettings({ runHeadless: v })
                      setSettingsState(next)
                      toast.info(v ? 'Automation sẽ chạy ẩn.' : 'Automation sẽ hiện cửa sổ trình duyệt.')
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 whitespace-nowrap rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-soft)]">
                  <span className="text-[12.5px]">Không fallback DIRECT</span>
                  <Switch
                    checked={settings?.noDirectFallback !== false}
                    onCheckedChange={async (v) => {
                      const next = await window.api.setSettings({ noDirectFallback: v })
                      setSettingsState(next)
                      if (!v) toast.warning('Đã TẮT no-direct: hết proxy sẽ chạy bằng IP thật của máy.')
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 whitespace-nowrap rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-soft)]">
                  <span className="text-[12.5px]" title="Kiểm tra nhiệm vụ theo mục tiêu và bộ quy tắc đang áp dụng">
                    ⏱ Tự động chạy
                  </span>
                  <Select
                    value={String(auto?.everyMs ?? settings?.autoEveryMs ?? 0)}
                    onValueChange={async (value) => {
                      const ms = Number(value)
                      const st = await window.api.autoSetEvery(ms)
                      setAuto({ ...(auto ?? { cycles: 0, running: false, lastCycleAt: null, lastCycleResult: null, remediations: 0 }), ...st })
                      toast.info(
                        ms === 0
                          ? 'Đã TẮT chế độ tự động.'
                          : `Tự động kiểm tra mỗi ${ms === 3600000 ? '1 giờ' : ms === 10800000 ? '3 giờ' : `${Math.round(ms / 60000)} phút`}, theo bộ quy tắc đang áp dụng.`
                      )
                    }}
                  >
                    <SelectTrigger aria-label="Tự động chạy" className="h-7 w-[148px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Tắt</SelectItem>
                      <SelectItem value="60000">Mỗi 1 phút</SelectItem>
                      <SelectItem value="900000">Mỗi 15 phút</SelectItem>
                      <SelectItem value="3600000">Mỗi 1 giờ</SelectItem>
                      <SelectItem value="10800000">Mỗi 3 giờ</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 whitespace-nowrap rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-soft)]">
                  <span className="text-[12.5px]" title="Áp dụng từ vòng lịch kế tiếp; vẫn tuân thủ giới hạn tổng và hàng đợi từng tài khoản">Điều phối lịch</span>
                  <Select value={String(settings?.autoParallelRuns ?? 1)} onValueChange={async value => {
                    try {
                      const parallel = Number(value)
                      const next = await window.api.setSettings({ autoParallelRuns: parallel })
                      setSettingsState(next)
                      toast.info(`Vòng lịch kế tiếp: ${parallel === 1 ? 'chạy tuần tự' : `chạy song song tối đa ${parallel} tài khoản`}. Vẫn tuân thủ giới hạn tổng.`)
                    } catch (e) { toast.error((e as Error).message) }
                  }}>
                    <SelectTrigger aria-label="Điều phối lịch tự động" className="h-7 w-[148px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="1">Tuần tự (1 acc)</SelectItem>{[2, 3, 4, 5, 6, 8, 10].map(n => <SelectItem key={n} value={String(n)}>Song song {n} acc</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 whitespace-nowrap rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-soft)]">
                  <span className="text-[12.5px]">Cập nhật song song</span>
                  <Select
                    value={String(settings?.refreshParallel ?? 3)}
                    onValueChange={async (value) => {
                      const v = Number(value)
                      const next = await window.api.setSettings({ refreshParallel: v })
                      setSettingsState(next)
                      toast.info(
                        v === 1
                          ? 'Cập nhật trạng thái sẽ chạy TUẦN TỰ từng tài khoản.'
                          : `Cập nhật trạng thái mở ${v} trình duyệt cùng lúc (nhanh hơn ~${v}×).`
                      )
                    }}
                  >
                    <SelectTrigger aria-label="Cập nhật song song" className="h-7 w-[148px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 8].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n === 1 ? 'Tuần tự' : `${n} acc`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3 whitespace-nowrap rounded-[8px] px-2 py-1.5 hover:bg-[var(--surface-soft)]">
                  <span className="text-[12.5px]">Giới hạn tổng (tuỳ chọn)</span>
                  <Select
                    value={String(queueMax)}
                    onValueChange={async (value) => {
                      const v = Number(value)
                      setQueueMax(v)
                      const next = await window.api.setSettings({ maxParallelRuns: v })
                      setSettingsState(next)
                      toast.info(
                        v === 0
                          ? 'Không giới hạn: các tài khoản chạy song song; cùng một acc thì chạy tuần tự.'
                          : 'Tối đa ' + v + ' acc chạy song song; acc vượt hạn sẽ chờ slot.'
                      )
                    }}
                  >
                    <SelectTrigger aria-label="Giới hạn tổng" className="h-7 w-[148px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">Không giới hạn</SelectItem>
                      {[2, 3, 4, 5, 6].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} acc</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>



          <Badge variant="outline">
            dữ liệu lưu: {rows.filter((r) => r.cache).length}/{rows.length}
          </Badge>
        </div>
      </header>

      {/* Nội dung */}
      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
        {tab === 'accounts' ? (
          <>
            <div className="border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 py-2">
              <StatStrip rows={rows} />

            </div>

            <AppToolbar
              selectedCount={targetIds.length}
              runningCount={rows.filter((x) => x.run.running).length}
              selectedBrowserCount={selectedRows.filter(row => row.browser.running).length}
              selectedRunningCount={selectedRows.filter(row => row.run.running).length}
              hiddenSelectedCount={hiddenSelectedCount}
              busy={busy}
              refreshing={refreshing}
              query={query}
              onQuery={setQuery}
              onClearSelection={clearSelection}
              onAdd={() => openAccountDialog(null)}
              onEdit={() => {
                if (selectedRows.length === 1) openAccountDialog(selectedRows[0].profile)
              }}
              onRemove={() => confirmRemove(targetIds)}
              onOpenBrowser={() => void Promise.all(targetIds.map((id) => withBrowser(id, 'open')))}
              onCloseBrowser={() => void Promise.all(targetIds.map((id) => withBrowser(id, 'close')))}
              onLoginWindow={() => {
                if (targetIds.length === 1) {
                  void act('login', async () => {
                    await window.api.openLoginWindow(targetIds[0])
                  })
                }
              }}
              onRun={(kinds) => void runKinds(targetIds, kinds)}
              onStop={() =>
                void act('stop', async () => {
                  const target = targetIds.filter((id) => rows.some((r) => r.id === id && r.run.running))
                  const toStop = targetIds.length ? target : rows.filter((x) => x.run.running).map((x) => x.id)
                  if (!toStop.length) return
                  for (const id of toStop) await window.api.stopRun(id)
                  toast.info(`Đã dừng chạy ${toStop.length} tài khoản.`)
                  await reload()
                })
              }
              onRefreshPoints={() => void refreshPoints(targetIds)}
              onReload={() => void reload()}
            />

            <AccountsTable
              rows={filtered}
              selectedIds={selectedIds}
              activeId={drawerOpen ? activeId : null}
              busy={busy}
              refreshingId={refreshingId}
              onSelect={selectRow}
              onToggleAll={() =>
                setSelectedIds(prev => toggleVisibleAccounts(prev, filtered.map(row => row.id)))
              }
              onOpenDetail={(id) => openDrawer(id)}
              onOpenBrowser={(id) => void withBrowser(id, 'open')}
              onCloseBrowser={(id) => void withBrowser(id, 'close')}
              onRefresh={(id) => void refreshPoints([id])}
              onRun={(id, kinds) => void runKinds([id], kinds)}
              onStop={(id) => void stopRunSingle(id)}
              proxyLabels={Object.fromEntries(proxies.map((p) => [p.id, p.label]))}
              proxyHealth={proxyHealth}
              onEdit={(id) => {
                const r = rows.find((x) => x.id === id)
                if (r) openAccountDialog(r.profile)
              }}
              onRemove={(id) => confirmRemove([id])}
              onSignOut={(id) =>
                void act(`signout:${id}`, async () => {
                  const r = await window.api.signOut(id)
                  if (r.ok) toast.success(`Đã đăng xuất (xoá ${r.cleared} cookie).`)
                  else toast.error(`Đăng xuất lỗi: ${r.error}`)
                  await reload()
                })
              }
            />
          </>
        ) : tab === 'keywords' ? (
          <KeywordsPanel />
        ) : tab === 'settings' ? (
          <SettingsPanel rows={rows} onSaved={() => {
            void window.api.getSettings().then(setSettingsState)
            void window.api.autoStatus().then(setAuto)
            void reload()
          }} />
        ) : tab === 'phone' ? (
          <PhonePanel rows={rows} />
        ) : tab === 'history' ? (
          <HistoryPanel />
        ) : (
          <ProxyPanel
            rows={rows}
            testProgress={proxyTest}
            onTestAll={() => void runProxyTest()}
            onTestSelected={(ids) => void runProxyTest(ids)}
            onChanged={() => {
              void window.api.listProxies().then((l) => {
                setProxyCount(l.length)
                setProxies(l)
              })
              void reload()
            }}
          />
        )}

        {/* Góc phải dưới: cục tròn tiến độ — kiểm tra proxy + acc đang chạy (giữ nguyên khi đổi tab) */}
        <div className="pointer-events-none fixed bottom-[64px] right-5 z-40 flex flex-col items-end gap-2">
          <div className="pointer-events-auto">
            <ProxyTestFab
              state={proxyTest}
              onStop={() => {
                void window.api.cancelTestAll?.()
                toast.info('Đang dừng kiểm tra proxy…')
              }}
            />
          </div>
          <div className="pointer-events-auto contents">
        {runningRows.length > 0 || queue.length > 0 || waiting.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                data-slot="run-fab"
                className="relative flex size-12 shrink-0 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--surface)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-colors hover:bg-[var(--surface-soft)] focus-visible:ring-2 focus-visible:ring-[var(--brand-blue-deep)]/30 focus-visible:outline-none data-[state=open]:bg-[var(--surface-soft)]"
                title={`${runningRows.length} acc đang chạy song song${queue.length ? ` · ${queue.reduce((s, q) => s + q.pending, 0)} lệnh đang chờ` : ''}${queueMax > 0 ? ` · giới hạn tổng ${queueMax}` : ' · không giới hạn tổng'} — bấm để xem tiến độ`}
                aria-label={`${runningRows.length} tài khoản đang chạy${queue.length ? `, ${queue.reduce((s, q) => s + q.pending, 0)} lệnh đang chờ` : ''}`}
              >
                <Loader2 className="size-5 animate-spin text-[var(--brand-blue-deep)]" />
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[var(--error)] text-[11px] font-semibold text-white">
                  {runningRows.length}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              side="top"
              sideOffset={8}
              avoidCollisions={false}
              className="flex w-[350px] flex-col overflow-hidden p-0"
            >
              <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-3 py-2">
                <span className="text-[12.5px] font-semibold">Đang chạy ({runningRows.length})</span>
                <span className="mm-micro">bấm ra ngoài để đóng</span>
              </div>
              <ScrollArea className="h-[264px] shrink-0" data-slot="running-accounts-scroll">
                <div className="p-2 pr-3">
                {runningRows.map((r) => {
                  const pr = progress[r.id]
                  const p = pr ? Math.round((pr.done / Math.max(1, pr.total)) * 100) : 0
                  return (
                    <div
                      key={r.id}
                      className="mb-1.5 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-2.5 py-2 last:mb-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--brand-blue-deep)]" />
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{r.profile.name}</span>
                        {(queue.find((q) => q.profileId === r.id)?.pending ?? 0) > 0 ? (
                          <span className="shrink-0 rounded bg-[var(--brand-blue-deep)]/10 px-1 text-[10.5px] font-semibold text-[var(--brand-blue-deep)]">
                            +{queue.find((q) => q.profileId === r.id)?.pending} lệnh chờ
                          </span>
                        ) : null}
                        <span className="mm-tabular shrink-0 text-[12px] text-[var(--steel)]">
                          {pr?.today != null ? `hôm nay ${pr.today}đ` : '—'}
                          {pr && pr.gained > 0 ? (
                            <span className="ml-1.5 font-semibold text-[var(--success-text)]">+{pr.gained}</span>
                          ) : null}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="w-[118px] shrink-0 text-[12px] text-[var(--steel)]">
                          {pr
                            ? pr.kind === 'mobile'
                              ? `Mobile ${pr.done}/${pr.total} search`
                              : pr.kind === 'desktop'
                                ? `Desktop ${pr.done}/${pr.total} search`
                                : pr.kind === 'earn'
                                  ? `Keep earning ${pr.done}/${pr.total} thẻ`
                                  : pr.kind === 'daily'
                                    ? `Daily set ${pr.done}/${pr.total} mục`
                                    : `${pr.kind} ${pr.done}/${pr.total}`
                            : 'đang chuẩn bị…'}
                        </span>
                        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--hairline)]">
                          <div className="h-full bg-[var(--primary)] transition-all" style={{ width: `${p}%` }} />
                        </div>
                        <span className="mm-tabular w-8 shrink-0 text-right text-[11.5px] text-[var(--stone)]">{p}%</span>
                      </div>
                    </div>
                  )
                })}
                {queue.length > 0 ? (
                  <div className="border-t border-[var(--hairline-soft)] px-2 pt-2 pb-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                      <span className="text-[12px] font-semibold text-[var(--stone)]">
                        Lệnh chờ của cùng acc ({queue.reduce((s, q) => s + q.pending, 0)})
                      </span>
                      <button
                        type="button"
                        className="shrink-0 rounded px-1.5 py-[1px] text-[11.5px] text-[var(--error)] hover:bg-[var(--surface)]"
                        title="Xoá toàn bộ lệnh chờ (dùng khi badge bị treo)"
                        onClick={async () => {
                          const r = await window.api.clearQueue()
                          toast.info(`Đã xoá ${r.cleared} lệnh chờ.`)
                        }}
                      >
                        Xoá hết
                      </button>
                    </div>
                    {queue.map((q) => (
                      <div
                        key={q.profileId}
                        className="mb-1 flex items-center gap-2 rounded-[8px] bg-[var(--surface)] px-2 py-1 last:mb-0"
                      >
                        <span className="min-w-0 flex-1 truncate text-[12px]">{q.name}</span>
                        <span className="mm-tabular shrink-0 text-[11.5px] text-[var(--stone)]">
                          {q.pending} lệnh chờ
                          {q.oldestWaitMs != null ? ` · ${Math.max(1, Math.round(q.oldestWaitMs / 60000))} phút` : ''}
                        </span>
                        <button
                          type="button"
                          className="shrink-0 rounded px-1.5 py-[1px] text-[11.5px] text-[var(--error)] hover:bg-[var(--canvas)]"
                          title={`Xoá lệnh chờ của ${q.name}`}
                          onClick={async () => {
                            const r = await window.api.clearQueue(q.profileId)
                            toast.info(`Đã xoá ${r.cleared} lệnh chờ của ${q.name}.`)
                          }}
                        >
                          Xoá
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {waiting.length > 0 ? (
                  <div className="border-t border-[var(--hairline-soft)] px-2 pt-2 pb-2">
                    <div className="mb-1.5 px-1 text-[12px] font-semibold text-[var(--stone)]">
                      Chờ slot ({waiting.length}) — giới hạn tổng {queueMax}
                    </div>
                    {waiting.map((w) => (
                      <div
                        key={w.profileId}
                        className="mb-1 flex items-center gap-2 rounded-[8px] bg-[var(--surface)] px-2 py-1 last:mb-0"
                      >
                        <span className="mm-tabular w-4 shrink-0 text-[11.5px] text-[var(--stone)]">{w.position}</span>
                        <span className="min-w-0 flex-1 truncate text-[12px]">{w.name}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
                </div>
              </ScrollArea>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
          </div>
        </div>

        <LogDock
          lines={logs}
          profileNames={Object.fromEntries(rows.map(row => [row.id, row.profile.name]))}
          onNavigate={destination => setTab(destination)}
          running={anyRunning}
          profileId={activeRow?.id ?? null}
          profileName={activeRow?.profile.name ?? null}
          defaultOpen={new URLSearchParams(location.search).get('dock') === '1'}
        />
      </main>

      <AccountDrawer
        row={activeRow}
        open={drawerOpen && tab === 'accounts' && !dialogOpen && !browsersOpen && !confirm}
        onOpenChange={setDrawerOpen}
        position={detailIndex >= 0 ? { index: detailIndex + 1, total: filtered.length } : undefined}
        onPrevious={detailIndex > 0 ? () => openDrawer(filtered[detailIndex - 1].id) : undefined}
        onNext={detailIndex >= 0 && detailIndex < filtered.length - 1 ? () => openDrawer(filtered[detailIndex + 1].id) : undefined}
        busy={busy}
        refreshingId={refreshingId}
        logs={logs.filter((l) => !l.profileId || l.profileId === activeRow?.id)}
        onRefresh={(id) => void refreshPoints([id])}
        onOpenBrowser={(id) => void withBrowser(id, 'open')}
        onCloseBrowser={(id) => void withBrowser(id, 'close')}
        onLoginWindow={(id) =>
          void act('login', async () => {
            await window.api.openLoginWindow(id)
          })
        }
        onRun={(id, kinds) => void runKinds([id], kinds)}
        onStop={(id) => void stopRunSingle(id)}
        onSignOut={(id) =>
          void act(`signout:${id}`, async () => {
            const r = await window.api.signOut(id)
            if (r.ok) {
              toast.success(
                `Đã đăng xuất (xoá ${r.cleared} cookie). Mở lại trình duyệt và đăng nhập tài khoản mong muốn.`
              )
            } else {
              toast.error(`Đăng xuất lỗi: ${r.error}`)
            }
            await reload()
          })
        }
        onResetProfile={(id) => {
          const row = rows.find((r) => r.id === id)
          setConfirm({
            title: `Xoá toàn bộ dữ liệu profile "${row?.profile.name ?? id}"?`,
            description:
              'Cookie, đăng nhập và mọi thứ trong thư mục profile sẽ bị xoá để làm lại từ đầu.\nHành động này không hoàn tác được.',
            confirmLabel: 'Xoá dữ liệu profile',
            danger: true,
            onConfirm: async () => {
              await act(`reset:${id}`, async () => {
                const r = await window.api.resetProfile(id)
                if (r.ok) {
                  toast.success('Đã xoá dữ liệu profile. Mở lại trình duyệt để đăng nhập tài khoản khác.')
                } else {
                  toast.error(`Lỗi: ${r.error}`)
                }
                await reload()
              })
            }
          })
        }}
      />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      <BrowsersDialog open={browsersOpen} onOpenChange={setBrowsersOpen} />

      <AccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        rows={rows}
        onSubmit={async (patch) => {
          if (editing) await window.api.updateProfile(editing.id, patch)
          else await window.api.addProfile(patch)
          await reload()
          toast.success(editing ? 'Đã lưu thay đổi.' : 'Đã thêm tài khoản.')
        }}
      />

      <Toaster position="top-right" closeButton />
    </div>
  )
}
