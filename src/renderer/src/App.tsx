import { useCallback, useEffect, useMemo, useState } from 'react'
import { Settings2, MonitorCog } from 'lucide-react'
import { toast } from 'sonner'
import type { AppSettings, LogLine, Profile, RefreshProgress, RowState } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Switch } from '@renderer/components/ui/switch'
import { AppToolbar } from '@renderer/components/AppToolbar'
import { AccountsTable } from '@renderer/components/AccountsTable'
import { AccountDialog } from '@renderer/components/AccountDialog'
import { AccountDrawer } from '@renderer/components/AccountDrawer'
import { BrowsersDialog } from '@renderer/components/BrowsersDialog'
import { ConfirmDialog, type ConfirmRequest } from '@renderer/components/ConfirmDialog'
import { LogDock } from '@renderer/components/LogDock'
import { StatStrip } from '@renderer/components/StatStrip'
import { Toaster } from '@renderer/components/ui/sonner'
import { fmtNum } from '@renderer/lib/utils'

export default function App(): React.JSX.Element {
  const [rows, setRows] = useState<RowState[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [logs, setLogs] = useState<LogLine[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState<{ done: number; total: number } | null>(null)
  const [query, setQuery] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(() => new URLSearchParams(location.search).get('drawer') === '1')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [browsersOpen, setBrowsersOpen] = useState(() => new URLSearchParams(location.search).get('browsers') === '1')
  const [browserCount, setBrowserCount] = useState(0)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

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
    setActiveId((cur) => cur ?? list[0]?.id ?? null)
  }, [])

  useEffect(() => {
    // Mo app: CHI doc cache, KHONG mo trinh duyet
    void reload()
    void window.api.getSettings().then(setSettingsState)
    void window.api.detectBrowsers().then((l) => setBrowserCount(l.filter((b) => b.chromium).length))
    const offLog = window.api.onLog((line) => setLogs((prev) => [...prev.slice(-400), line]))
    const offSnap = window.api.onSnapshot(() => void reload())
    const offProg = window.api.onRefreshProgress((p: RefreshProgress) => setRefreshing({ done: p.done, total: p.total }))
    const timer = window.setInterval(() => void reload(), 60000)
    return () => {
      offLog()
      offSnap()
      offProg()
      window.clearInterval(timer)
    }
  }, [reload])

  const anyRunning = rows.some((r) => r.run.running)
  const anyBrowserOpen = rows.some((r) => r.browser.running)

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
      toast.info(`Đang mở trình duyệt để lấy điểm cho ${ids.length} tài khoản…`)
      await window.api.refreshPoints(ids)
      setRefreshing(null)
      await reload()
      toast.success('Đã cập nhật số liệu mới.')
    })

  const withBrowser = (id: string, action: 'open' | 'close'): Promise<void> =>
    act(`browser:${id}`, async () => {
      if (action === 'open') {
        const r = await window.api.openBrowser(id)
        if (!r.ok) throw new Error(r.error ?? 'không mở được trình duyệt')
        toast.success(`Đã mở trình duyệt (CDP ${r.cdpUrl})`)
      } else {
        await window.api.closeBrowser(id)
        toast.info('Đã đóng trình duyệt.')
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

  const targetIds = selectedIds.length ? selectedIds : activeId ? [activeId] : []

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

  return (
    <div className="flex h-full flex-col bg-[var(--canvas)]">
      {/* Promo banner kiểu MiniMax */}
      <div className="flex items-center justify-center gap-3 bg-[var(--primary)] px-4 py-1.5 text-[12.5px] font-medium text-white">
        <span>
          Hôm nay đã kiếm{' '}
          <strong className="font-semibold">
            {fmtNum(rows.reduce((s, r) => s + (r.cache?.todayPoints ?? 0), 0))}
          </strong>{' '}
          điểm · {rows.length} tài khoản · {rows.filter((r) => r.browser.running).length} trình duyệt đang mở
        </span>
        {rows.some((r) => r.needsRefresh) ? (
          <span className="rounded-full bg-[var(--brand-coral)] px-[10px] py-[2px] text-[12px] font-semibold">
            có số liệu của hôm qua
          </span>
        ) : null}
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
            <span className="rounded-full bg-[var(--surface)] px-3 py-1 text-[12.5px] font-medium">Tài khoản</span>
            <span className="px-3 py-1 text-[12.5px] text-[var(--steel)]">Lịch sử</span>
            <span className="px-3 py-1 text-[12.5px] text-[var(--steel)]">Cài đặt</span>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" variant="tertiary" className="gap-1.5" onClick={openBrowsers}>
            <MonitorCog className="size-3.5" /> Trình duyệt
            {browserCount > 0 ? <span className="text-[var(--stone)]">({browserCount})</span> : null}
          </Button>
          <div className="hidden items-center gap-2 rounded-full border border-[var(--hairline)] px-3 py-1.5 lg:flex">
            <Settings2 className="size-3.5 text-[var(--steel)]" />
            <span className="text-[13px]">Sang ngày mới tự lấy điểm</span>
            <Switch
              checked={settings?.autoRefreshOnNewDay ?? true}
              onCheckedChange={async (v) => {
                const next = await window.api.setSettings({ autoRefreshOnNewDay: v })
                setSettingsState(next)
              }}
            />
          </div>
          <Badge variant="outline">
            dữ liệu lưu: {rows.filter((r) => r.cache).length}/{rows.length}
          </Badge>
        </div>
      </header>

      {/* Nội dung */}
      <main className="flex min-h-0 flex-1 flex-col p-2.5">
        <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px] flex-col gap-2">
          <StatStrip rows={rows} />

          <AppToolbar
            selectedCount={targetIds.length}
            anyBrowserOpen={anyBrowserOpen}
            anyRunning={anyRunning}
            busy={busy}
            refreshing={refreshing}
            query={query}
            onQuery={setQuery}
            onAdd={() => openAccountDialog(null)}
            onEdit={() => {
              if (activeRow) openAccountDialog(activeRow.profile)
            }}
            onRemove={() => {
              const ids = targetIds
              if (!ids.length) return
              setConfirm({
                title: `Xoá ${ids.length} tài khoản khỏi danh sách?`,
                description:
                  'Chỉ xoá khỏi danh sách quản lý — KHÔNG xoá thư mục profile, nên có thể thêm lại sau.',
                confirmLabel: 'Xoá khỏi danh sách',
                danger: true,
                onConfirm: async () => {
                  for (const id of ids) await window.api.removeProfile(id)
                  setSelectedIds([])
                  setActiveId(null)
                  await reload()
                  toast.success(`Đã xoá ${ids.length} tài khoản khỏi danh sách.`)
                }
              })
            }}
            onOpenBrowser={() => void Promise.all(targetIds.map((id) => withBrowser(id, 'open')))}
            onCloseBrowser={() => void Promise.all(targetIds.map((id) => withBrowser(id, 'close')))}
            onLoginWindow={() => {
              if (activeId) {
                void act('login', async () => {
                  await window.api.openLoginWindow(activeId)
                })
              }
            }}
            onRun={(kinds) => void runKinds(targetIds, kinds)}
            onStop={() =>
              void act('stop', async () => {
                for (const r of rows.filter((x) => x.run.running)) await window.api.stopRun(r.id)
                await reload()
              })
            }
            onRefreshPoints={() => void refreshPoints(targetIds)}
            onReload={() => void reload()}
          />

          <AccountsTable
            rows={filtered}
            selectedIds={selectedIds}
            activeId={activeId}
            busy={busy}
            onToggle={(id) =>
              setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
            }
            onToggleAll={() =>
              setSelectedIds((prev) => (prev.length === filtered.length ? [] : filtered.map((r) => r.id)))
            }
            onOpenDetail={(id) => openDrawer(id)}
            onOpenBrowser={(id) => void withBrowser(id, 'open')}
            onCloseBrowser={(id) => void withBrowser(id, 'close')}
            onRefresh={(id) => void refreshPoints([id])}
            onRun={(id, kinds) => void runKinds([id], kinds)}
          />

          <LogDock
            lines={logs}
            running={anyRunning}
            profileId={activeRow?.id ?? null}
            profileName={activeRow?.profile.name ?? null}
            defaultOpen={new URLSearchParams(location.search).get('dock') === '1'}
          />
        </div>
      </main>

      <AccountDrawer
        row={activeRow}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        busy={busy}
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
