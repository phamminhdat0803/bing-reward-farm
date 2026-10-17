import { ProxyAutoFillButton } from './ProxyAutoFillButton'
import { useVirtualRows } from '@renderer/lib/use-virtual-rows'
import { proxyTestCandidates } from '@shared/proxy-testing'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowUpDown,
  Check,
  ChevronDown,
  ClipboardPaste,
  Download,
  FileText,
  Filter,
  History,
  MapPin,
  Clock3,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  UserPlus,
  Wifi,
  X
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { ProxyDialog } from '@renderer/components/ProxyDialog'
import { BulkProxyDialog } from '@renderer/components/BulkProxyDialog'
import { AssignProxyDialog } from '@renderer/components/AssignProxyDialog'
import { ConfirmDialog, type ConfirmRequest } from '@renderer/components/ConfirmDialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { timeAgo } from '@renderer/lib/utils'
import type { ProxyItem, ProxyStat, RowState } from '@shared/types'

type StatusFilter = 'all' | 'ok' | 'error' | 'untested' | 'dead5' | 'dead7' | 'dead10' | 'active' | 'unused' | 'blacklisted'
type ProtocolFilter = 'all' | 'socks5' | 'socks4' | 'http'
type UsageFilter = 'all' | 'used' | 'unused'
type SortBy = 'default' | 'latency-asc' | 'latency-desc' | 'label' | 'tested'

const sortLabels: Record<SortBy, string> = {
  default: 'Mặc định (thứ tự thêm)',
  'latency-asc': 'Độ trễ tăng dần (nhanh nhất trước)',
  'latency-desc': 'Độ trễ giảm dần',
  label: 'Tên A → Z',
  tested: 'Vừa test gần đây'
}

const statusLabels: Record<StatusFilter, string> = {
  all: 'Tất cả',
  ok: 'Hoạt động',
  error: 'Lỗi',
  untested: 'Chưa test',
  active: 'Đang bật',
  unused: 'Không dùng',
  blacklisted: 'Blacklist',
  dead5: 'Chết ≥5 lần liên tiếp',
  dead7: 'Chết ≥7 lần liên tiếp',
  dead10: 'Chết ≥10 lần liên tiếp'
}

const protocolLabels: Record<ProtocolFilter, string> = {
  all: 'Tất cả',
  socks5: 'SOCKS5',
  socks4: 'SOCKS4',
  http: 'HTTP / HTTPS'
}

const usageLabels: Record<UsageFilter, string> = {
  all: 'Tất cả',
  used: 'Đang dùng',
  unused: 'Chưa gắn'
}

function getProxyProtocol(url: string): 'socks5' | 'socks4' | 'http' {
  const m = url.match(/^([a-z0-9]+):\/\//i)
  const scheme = (m?.[1] ?? 'http').toLowerCase()
  if (scheme === 'socks5') return 'socks5'
  if (scheme === 'socks4') return 'socks4'
  return 'http'
}

/** Nhãn ngắn trong bảng; lỗi gốc vẫn có trong title và lịch sử test. */
function proxyErrorLabel(error?: string): string {
  if (!error) return 'Không thể kết nối'
  if (/CHAN BING|chặn bing/i.test(error)) return 'Không truy cập được Bing'
  if (/timeout|timed out/i.test(error)) return 'Hết thời gian chờ'
  if (/refused|ECONNREFUSED/i.test(error)) return 'Kết nối bị từ chối'
  if (/ENOTFOUND|name.*resolved|DNS/i.test(error)) return 'Không tìm thấy máy chủ'
  if (/reset|ECONNRESET/i.test(error)) return 'Kết nối bị ngắt'
  if (/407|authentication|credentials/i.test(error)) return 'Lỗi xác thực proxy'
  return 'Không thể kết nối'
}

/** Tab "Proxy": kho proxy dùng chung, lọc tìm kiếm, test trực tiếp, xoá nhiều, biết tài khoản nào đang gắn. */
export function ProxyPanel({
  rows,
  onChanged,
  testProgress = null,
  onTestAll,
  onTestSelected
}: {
  rows: RowState[]
  onChanged: () => void
  /** Tiến độ kiểm tra theo lô do App giữ (đổi tab không mất) */
  testProgress?: { done: number; total: number; ok: number; error: number } | null
  onTestAll?: () => void
  onTestSelected?: (ids: string[]) => void
}): React.JSX.Element {
  const csvInput = useRef<HTMLInputElement>(null)
  const [items, setItems] = useState<ProxyItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignTarget, setAssignTarget] = useState<ProxyItem | null>(null)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<ProxyItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  // Bộ lọc
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')
  const [sortBy, setSortBy] = useState<SortBy>('default')
  /** Lịch sử test từng proxy: số lần sống/chết, tỉ lệ, chuỗi thất bại (proxy-history.json) */
  const [stats, setStats] = useState<Record<string, ProxyStat>>({})
  /** Proxy đang mở hộp lịch sử test */
  const [historyOf, setHistoryOf] = useState<ProxyItem | null>(null)

  const reload = async (): Promise<void> => {
    const list = await window.api.listProxies()
    setItems(list)
    setSelectedIds((prev) => prev.filter((id) => list.some((x) => x.id === id)))
    try {
      const st = await window.api.proxyStats()
      setStats(Object.fromEntries(st.map((s) => [s.id, s])))
    } catch {
      /* bo qua */
    }
  }

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 30000)
    // Cập nhật real-time từng dòng khi proxy test xong (tiến độ tổng do App hiển thị ở góc phải)
    const unsub = window.api.onTestProgress?.((p) => {
      setItems((prev) => prev.map((item) => (item.id === p.id ? { ...item, lastTest: p.result } : item)))
    })
    return () => {
      window.clearInterval(t)
      unsub?.()
    }
  }, [])

  const usersOf = (idOrItem: string | ProxyItem): RowState[] => {
    const item = typeof idOrItem === 'string' ? items.find((x) => x.id === idOrItem) : idOrItem
    const id = typeof idOrItem === 'string' ? idOrItem : idOrItem.id
    const url = item?.url
    return rows.filter(
      (r) =>
        r.profile.proxyId === id ||
        (url && r.profile.proxy === url) ||
        (url && r.profile.proxyFallbacks && r.profile.proxyFallbacks.includes(url))
    )
  }

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

  const setProxyStatus = (ids: string[], status: NonNullable<ProxyItem['status']>): Promise<void> =>
    act('status', async () => {
      for (const id of ids) {
        const result = await window.api.updateProxy(id, { status })
        if (!result.ok) throw new Error(result.error)
      }
      await reload()
      onChanged()
      toast.success(`Đã cập nhật ${ids.length} proxy. Lượt kiểm tra đang thực hiện sẽ hoàn tất; các lượt mới dùng trạng thái mới.`)
    })

  const testOne = (id: string): Promise<void> =>
    act(`test:${id}`, async () => {
      const r = await window.api.testSavedProxy(id)
      if (r.ok) toast.success(`Proxy OK — IP ${r.ip}${r.country ? ` (${r.country})` : ''} · ${r.latency}ms`)
      else toast.error(`Proxy lỗi: ${r.error}`)
      await reload()
    })

  const testSelected = (): void => {
    if (!selectedIds.length) return
    onTestSelected?.(selectedIds)
  }

  // Blacklist là danh sách riêng; không góp vào bảng và thống kê thông thường.
  const scopedItems = useMemo(() => items.filter(p =>
    statusFilter === 'blacklisted' ? p.status === 'blacklisted' : p.status !== 'blacklisted'
  ), [items, statusFilter])

  useEffect(() => {
    setSelectedIds(prev => prev.filter(id => scopedItems.some(p => p.id === id)))
  }, [scopedItems])

  // Thống kê đếm cho các bộ lọc
  const counts = useMemo(() => {
    let ok = 0
    let error = 0
    let untested = 0
    let socks5 = 0
    let socks4 = 0
    let http = 0
    let used = 0
    let unused = 0
    let dead10 = 0

    for (const p of scopedItems) {
      if (!p.lastTest) untested++
      else if (p.lastTest.ok) ok++
      else error++
      if (stats[p.id]?.dead10) dead10++

      const proto = getProxyProtocol(p.url)
      if (proto === 'socks5') socks5++
      else if (proto === 'socks4') socks4++
      else http++

      if (usersOf(p.id).length > 0) used++
      else unused++
    }

    return { ok, error, untested, socks5, socks4, http, used, unused, dead10 }
  }, [scopedItems, rows, stats])

  /** Proxy 10 lần test gần nhất đều chết (để xoá hàng loạt) */
  const deadList = useMemo(() => scopedItems.filter((p) => stats[p.id]?.dead10), [scopedItems, stats])

  // Lọc danh sách proxy
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scopedItems.filter((p) => {
      if (q) {
        const t = p.lastTest
        const matchLabel = p.label.toLowerCase().includes(q)
        const matchUrl = p.url.toLowerCase().includes(q)
        const matchNote = p.note ? p.note.toLowerCase().includes(q) : false
        const matchIp = t?.ip ? t.ip.toLowerCase().includes(q) : false
        const matchCountry = t?.country ? t.country.toLowerCase().includes(q) : false
        const matchCity = t?.city ? t.city.toLowerCase().includes(q) : false
        const matchError = t?.error ? t.error.toLowerCase().includes(q) : false
        if (!matchLabel && !matchUrl && !matchNote && !matchIp && !matchCountry && !matchCity && !matchError) {
          return false
        }
      }

      if (statusFilter === 'ok') {
        if (!p.lastTest?.ok) return false
      } else if (statusFilter === 'error') {
        if (!p.lastTest || p.lastTest.ok) return false
      } else if (statusFilter === 'untested') {
        if (p.lastTest != null) return false
      } else if (statusFilter.startsWith('dead')) {
        if ((stats[p.id]?.failStreak ?? 0) < Number(statusFilter.slice(4))) return false
      } else if (['active', 'unused', 'blacklisted'].includes(statusFilter)) {
        if ((p.status ?? 'active') !== statusFilter) return false
      }

      if (protocolFilter !== 'all') {
        const proto = getProxyProtocol(p.url)
        if (proto !== protocolFilter) return false
      }

      if (usageFilter === 'used') {
        if (usersOf(p.id).length === 0) return false
      } else if (usageFilter === 'unused') {
        if (usersOf(p.id).length > 0) return false
      }

      return true
    })
  }, [scopedItems, search, statusFilter, protocolFilter, usageFilter, rows, stats])

  // Sap xep: mac dinh theo thu tu them vao; ho tro sort theo do tre (reply delay)
  const sortedItems = useMemo(() => {
    const arr = [...filteredItems]
    const lat = (p: ProxyItem): number => (p.lastTest?.ok && p.lastTest.latency != null ? p.lastTest.latency : Number.POSITIVE_INFINITY)
    if (sortBy === 'latency-asc') arr.sort((a, b) => lat(a) - lat(b))
    else if (sortBy === 'latency-desc') arr.sort((a, b) => {
      const la = lat(a)
      const lb = lat(b)
      if (la === Number.POSITIVE_INFINITY) return 1
      if (lb === Number.POSITIVE_INFINITY) return -1
      return lb - la
    })
    else if (sortBy === 'label') arr.sort((a, b) => a.label.localeCompare(b.label))
    else if (sortBy === 'tested') arr.sort((a, b) => (b.lastTest?.at ?? '').localeCompare(a.lastTest?.at ?? ''))
    return arr
  }, [filteredItems, sortBy])

  const selectedFilteredCount = useMemo(() => filteredItems.filter(p => selectedSet.has(p.id)).length, [filteredItems, selectedSet])
  const virtual = useVirtualRows(sortedItems.length, JSON.stringify([search, statusFilter, protocolFilter, usageFilter, sortBy]))

  const hasActiveFilter =
    search.trim() !== '' || statusFilter !== 'all' || protocolFilter !== 'all' || usageFilter !== 'all'

  const resetFilters = (): void => {
    setSearch('')
    setStatusFilter('all')
    setProtocolFilter('all')
    setUsageFilter('all')
  }

  // Chọn tất cả / bỏ chọn các proxy đang hiển thị
  const toggleSelectAll = (): void => {
    const visibleIds = sortedItems.map((p) => p.id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id))
    if (allVisibleSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)))
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])))
    }
  }

  const toggleSelectOne = (id: string): void => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  // Xoá 1 proxy
  // Gán proxy này cho các tài khoản được chọn trong AssignProxyDialog
  const assignTo = async (ids: string[]): Promise<void> => {
    const proxy = assignTarget
    if (!proxy) return
    const all = rows
    for (const r of all) {
      const shouldUse = ids.includes(r.id)
      const isUsing = r.profile.proxyId === proxy.id
      if (shouldUse && !isUsing) {
        // eslint-disable-next-line no-await-in-loop
        await window.api.updateProfile(r.id, { proxyId: proxy.id })
      } else if (!shouldUse && isUsing) {
        // eslint-disable-next-line no-await-in-loop
        await window.api.updateProfile(r.id, { proxyId: null })
      }
    }
    toast.success(`Đã gán proxy "${proxy.label}" cho ${ids.length} tài khoản.`)
    await reload()
    onChanged()
  }

  const deleteOne = (p: ProxyItem): void => {
    const users = usersOf(p.id)
    if (users.length) {
      toast.error(`Đang có ${users.length} tài khoản dùng proxy này — đổi proxy cho các acc đó trước.`)
      return
    }
    setConfirm({
      title: `Xoá proxy "${p.label}"?`,
      description: 'Thao tác này sẽ xoá proxy khỏi kho lưu trữ và không thể hoàn tác.',
      confirmLabel: 'Xoá proxy',
      danger: true,
      onConfirm: async () => {
        const r = await window.api.removeProxy(p.id)
        if (!r.ok) throw new Error(r.error)
        toast.success('Đã xoá proxy khỏi kho.')
        setSelectedIds((prev) => prev.filter((x) => x !== p.id))
        await reload()
        onChanged()
      }
    })
  }

  // Xoá nhiều proxy đã chọn
  const deleteSelected = (): void => {
    if (!selectedIds.length) return
    const selectedItems = items.filter((p) => selectedSet.has(p.id))
    const inUse = selectedItems.filter((p) => usersOf(p.id).length > 0)
    const free = selectedItems.filter((p) => usersOf(p.id).length === 0)

    if (free.length === 0) {
      toast.error(
        `Không thể xoá: toàn bộ ${inUse.length} proxy đã chọn đang được gắn vào tài khoản. Hãy đổi proxy cho các tài khoản trước.`
      )
      return
    }

    if (inUse.length > 0) {
      const inUseNames = Array.from(
        new Set(inUse.flatMap((p) => usersOf(p.id).map((u) => u.profile.name)))
      ).slice(0, 5)
      const more = inUse.length > 5 ? ` và ${inUse.length - 5} proxy khác` : ''

      setConfirm({
        title: `Xoá ${free.length} proxy chưa gắn?`,
        description: `Đã chọn ${selectedIds.length} proxy.\nCó ${inUse.length} proxy đang được tài khoản (${inUseNames.join(', ')}${more}) sử dụng — các proxy này sẽ được giữ lại.\nBạn có chắc muốn xoá ${free.length} proxy chưa gắn còn lại khỏi kho?`,
        confirmLabel: `Xoá ${free.length} proxy`,
        danger: true,
        onConfirm: async () => {
          const freeIds = free.map((p) => p.id)
          const r = await window.api.removeProxies(freeIds)
          if (!r.ok) throw new Error(r.error)
          toast.success(`Đã xoá ${r.removed ?? freeIds.length} proxy khỏi kho.`)
          setSelectedIds((prev) => prev.filter((id) => !freeIds.includes(id)))
          await reload()
          onChanged()
        }
      })
      return
    }

    setConfirm({
      title: `Xoá ${selectedIds.length} proxy đã chọn?`,
      description: `Thao tác này sẽ xoá vĩnh viễn ${selectedIds.length} proxy khỏi kho lưu trữ và không thể hoàn tác.`,
      confirmLabel: `Xoá ${selectedIds.length} proxy`,
      danger: true,
      onConfirm: async () => {
        const r = await window.api.removeProxies(selectedIds)
        if (!r.ok) throw new Error(r.error)
        toast.success(`Đã xoá ${r.removed ?? selectedIds.length} proxy khỏi kho.`)
        setSelectedIds([])
        await reload()
        onChanged()
      }
    })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <input ref={csvInput} type="file" accept=".csv,text/csv" className="hidden" aria-label="Nhập CSV proxy" onChange={event => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) void act('importCsv', async () => {
          const result = await window.api.importProxyCsv(await file.text())
          if (!result.ok) throw new Error(result.error)
          toast.success(`Đã nhập ${result.added} proxy; bỏ qua ${result.skipped} URL trùng. Giữ nguyên proxy đã có.`)
          await reload()
          onChanged()
        })
      }} />
      {/* Các nhóm luôn giữ nguyên vị trí khi chọn/bỏ chọn hoặc đang test. */}
      <div data-slot="proxy-toolbar" className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 [&>button]:shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="size-3.5" /> Thêm proxy <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[220px]">
            <DropdownMenuItem className="gap-2" onClick={() => { setEditing(null); setDialogOpen(true) }}>
              <Plus className="size-3.5" /> Thêm một proxy
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => setBulkOpen(true)}>
              <ClipboardPaste className="size-3.5" /> Dán hàng loạt
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => csvInput.current?.click()}>
              <FileText className="size-3.5" /> Nhập CSV (cột url, ten, note, status)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <ProxyAutoFillButton onChanged={() => { void reload(); onChanged() }} />
        <span className="mx-1 h-5 w-px shrink-0 bg-[var(--hairline)]" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="secondary" className="gap-1.5">
              <Wifi className="size-3.5" /> Kiểm tra <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <DropdownMenuItem className="gap-2" disabled={!proxyTestCandidates(items, selectedIds).length || !!testProgress} onClick={testSelected}>
              <Wifi className="size-3.5" /> Kiểm tra đã chọn ({proxyTestCandidates(items, selectedIds).length})
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" disabled={!proxyTestCandidates(items).length || !!testProgress} onClick={() => onTestAll?.()}>
              <Wifi className="size-3.5" /> Kiểm tra tất cả ({proxyTestCandidates(items).length})
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="gap-1.5">
              <Download className="size-3.5" /> Xuất dữ liệu <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">

        <DropdownMenuItem
          className="gap-1.5"
          disabled={!items.length}
          title="Xuất toàn bộ kho proxy kèm thống kê test ra CSV"
          onClick={() =>
            void act('exportCsv', async () => {
              const head =
                'ten,url,giao_thuc,lan_test,thanh_cong,that_bai,ti_le_thanh_cong,that_bai_lien_tiep,lan_test_cuoi,ket_qua_cuoi,ip,quoc_gia,ping_ms,loi_cuoi,tai_khoan_dang_dung,note,status'
              const lines = items.map((p) => {
                const s = stats[p.id]
                const users = usersOf(p.id)
                  .map((u) => u.profile.name)
                  .join('; ')
                return [
                  `"${p.label.replace(/"/g, '""')}"`,
                  `"${p.url.replace(/"/g, '""')}"`,
                  getProxyProtocol(p.url),
                  s?.total ?? 0,
                  s?.ok ?? 0,
                  s?.fail ?? 0,
                  s?.successRate ?? '',
                  s?.failStreak ?? 0,
                  s?.lastAt ?? '',
                  p.lastTest ? (p.lastTest.ok ? 'OK' : 'LỖI') : 'chưa test',
                  p.lastTest?.ip ?? '',
                  p.lastTest?.country ?? '',
                  p.lastTest?.latency ?? '',
                  `"${(p.lastTest?.error ?? '').replace(/"/g, "'")}"`,
                  `"${users}"`,
                  `"${(p.note ?? '').replace(/"/g, '""')}"`,
                  p.status ?? 'active'
                ].join(',')
              })
              const csv = [head, ...lines].join('\n')
              const r = await window.api.exportSave({
                name: `proxy-${new Date().toISOString().slice(0, 10)}.csv`,
                content: csv,
                ext: 'csv'
              })
              if (r.ok) toast.success(`Đã lưu ${items.length} proxy: ${r.path}`)
              else if (!r.canceled) toast.error(r.error ?? 'không lưu được file')
            })
          }
        >
          <Download className="size-3.5" /> Xuất CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-1.5"
          disabled={!items.length}
          title="Xuất JSON (kèm lịch sử test từng proxy) để backup hoặc gửi agent"
          onClick={() =>
            void act('exportJson', async () => {
              const json = JSON.stringify(
                {
                  exportedAt: new Date().toISOString(),
                  total: items.length,
                  proxies: items.map((p) => ({
                    label: p.label,
                    url: p.url,
                    note: p.note ?? null,
                    lastTest: p.lastTest ?? null,
                    usedBy: usersOf(p.id).map((u) => u.profile.name),
                    stats: stats[p.id] ?? null
                  }))
                },
                null,
                2
              )
              const r = await window.api.exportSave({
                name: `proxy-${new Date().toISOString().slice(0, 10)}.json`,
                content: json,
                ext: 'json'
              })
              if (r.ok) toast.success(`Đã lưu JSON: ${r.path}`)
              else if (!r.canceled) toast.error(r.error ?? 'không lưu được file')
            })
          }
        >
          <Download className="size-3.5" /> Xuất JSON
        </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-1.5"
          title="Xuất log tài khoản (số liệu, tiến độ, proxy, lịch sử, hồ sơ, log thô) ra file .log"
          onClick={() =>
            void act('exportLog', async () => {
              const text = await window.api.exportAccountsLog()
              const r = await window.api.exportSave({
                name: `reward-farm-log-${new Date().toISOString().slice(0, 10)}.log`,
                content: text,
                ext: 'txt'
              })
              if (r.ok) toast.success(`Đã lưu log tài khoản: ${r.path}`)
              else if (!r.canceled) toast.error(r.error ?? 'không lưu được file')
            })
          }
        >
          <FileText className="size-3.5" /> Xuất log tài khoản
        </DropdownMenuItem>

          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="gap-1.5">
              <MoreHorizontal className="size-3.5" /> Thao tác khác <ChevronDown className="size-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px]">
            {(['active', 'unused', 'blacklisted'] as const).map(status => (
              <DropdownMenuItem key={status} disabled={!selectedIds.length || !!busy} onClick={() => void setProxyStatus(selectedIds, status)}>
                {status === 'active' ? 'Bật lại' : status === 'unused' ? 'Đánh dấu không dùng' : 'Đưa vào blacklist'} đã chọn ({selectedIds.length})
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem className="gap-2" disabled={selectedIds.length !== 1} onClick={() => {
              const proxy = items.find((p) => p.id === selectedIds[0])
              if (proxy) { setEditing(proxy); setDialogOpen(true) }
            }}>
              <Pencil className="size-3.5" /> Sửa proxy đã chọn
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onClick={() => void reload()}>
              <RefreshCw className="size-3.5" /> Nạp lại bảng
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" disabled={!selectedIds.length} onClick={() => setSelectedIds([])}>
              <X className="size-3.5" /> Bỏ chọn tất cả
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 text-[var(--error)]" disabled={!selectedIds.length || !!testProgress} onClick={deleteSelected}>
              <Trash2 className="size-3.5" /> Xoá proxy đã chọn ({selectedIds.length})
            </DropdownMenuItem>
        <DropdownMenuItem
          className="gap-1.5 text-[var(--error)]"
          disabled={!deadList.length || !!testProgress}
          title="Xoá các proxy mà 10 lần test gần nhất đều chết"
          onClick={() =>
            setConfirm({
              title: `Xoá ${deadList.length} proxy chết 10 lần liên tiếp?`,
              description:
                `Các proxy này đã test 10 lần gần nhất đều KHÔNG kết nối được:\n` +
                deadList
                  .slice(0, 8)
                  .map((p) => `• ${p.label}`)
                  .join('\n') +
                (deadList.length > 8 ? `\n… và ${deadList.length - 8} proxy khác` : '') +
                `\n\nProxy đang gắn vào tài khoản sẽ bị bỏ gắn trước khi xoá.`,
              confirmLabel: `Xoá ${deadList.length} proxy`,
              danger: true,
              onConfirm: async () => {
                const ids = deadList.map((p) => p.id)
                await window.api.removeProxies(ids)
                await window.api.proxyHistoryClear(ids)
                toast.success(`Đã xoá ${ids.length} proxy chết và lịch sử test của chúng.`)
                await reload()
                onChanged()
              }
            })
          }
        >
          <Trash2 className="size-3.5" /> Xoá chết ≥10 ({deadList.length})
        </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div className="ml-auto flex w-[160px] shrink-0 items-center justify-end gap-1.5 pl-2">
          <span data-slot="proxy-selection-count" className="mm-tabular whitespace-nowrap text-[12.5px] text-[var(--steel)]" aria-live="polite">
            {selectedIds.length} proxy đã chọn
          </span>
          <Button size="icon-sm" variant="tertiary" disabled={!selectedIds.length} onClick={() => setSelectedIds([])} title="Bỏ chọn tất cả">
            <X className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Thanh bộ lọc */}
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--hairline-soft)] bg-[var(--surface)]/30 px-3 [&>*]:shrink-0">
        {/* Sắp xếp theo độ trễ (reply delay) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="h-8 w-[210px] justify-between gap-1.5 whitespace-nowrap text-[12.5px]">
              <ArrowUpDown className="size-3.5" /> Sắp xếp: {sortLabels[sortBy].split(' (')[0]}
              <ChevronDown className="size-3.5 text-[var(--stone)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[270px]">
            {(Object.keys(sortLabels) as SortBy[]).map((k) => (
              <DropdownMenuItem key={k} className="gap-2" onClick={() => setSortBy(k)}>
                {sortBy === k ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                {sortLabels[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--stone)]" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm tên, URL, IP, quốc gia..."
            className="h-8 w-[230px] pl-8 pr-7 text-[12.5px]"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--stone)] hover:text-[var(--ink)]"
              title="Xoá tìm kiếm"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {/* Dropdown Trạng thái */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="h-8 gap-1.5 whitespace-nowrap text-[12.5px]">
              <Filter className="size-3 text-[var(--stone)]" />
              <span>
                Trạng thái: <strong>{statusLabels[statusFilter]}</strong>
              </span>
              <ChevronDown className="size-3 text-[var(--stone)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            <DropdownMenuItem onClick={() => setStatusFilter('all')}>Tất cả ({items.filter(p => p.status !== 'blacklisted').length})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('ok')} className="gap-1.5">
              <Badge variant="success" className="px-1 py-0 text-[10px]">
                OK
              </Badge>
              Hoạt động ({counts.ok})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('error')} className="gap-1.5">
              <Badge variant="destructive" className="px-1 py-0 text-[10px]">
                LỖI
              </Badge>
              Lỗi ({counts.error})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setStatusFilter('untested')}>
              Chưa kiểm tra ({counts.untested})
            </DropdownMenuItem>
            {(['dead5', 'dead7', 'dead10', 'active', 'unused', 'blacklisted'] as StatusFilter[]).map(filter => (
              <DropdownMenuItem key={filter} onClick={() => setStatusFilter(filter)}>
                {statusLabels[filter]} ({(filter === 'blacklisted' ? items : items.filter(p => p.status !== 'blacklisted')).filter(p => filter.startsWith('dead') ? (stats[p.id]?.failStreak ?? 0) >= Number(filter.slice(4)) : (p.status ?? 'active') === filter).length})
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dropdown Giao thức */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="h-8 gap-1.5 whitespace-nowrap text-[12.5px]">
              <span>
                Giao thức: <strong>{protocolLabels[protocolFilter]}</strong>
              </span>
              <ChevronDown className="size-3 text-[var(--stone)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[176px]">
            <DropdownMenuItem onClick={() => setProtocolFilter('all')}>
              Tất cả giao thức ({scopedItems.length})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProtocolFilter('socks5')}>SOCKS5 ({counts.socks5})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProtocolFilter('socks4')}>SOCKS4 ({counts.socks4})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProtocolFilter('http')}>HTTP / HTTPS ({counts.http})</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dropdown Sử dụng */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="h-8 gap-1.5 whitespace-nowrap text-[12.5px]">
              <span>
                Sử dụng: <strong>{usageLabels[usageFilter]}</strong>
              </span>
              <ChevronDown className="size-3 text-[var(--stone)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[176px]">
            <DropdownMenuItem onClick={() => setUsageFilter('all')}>Tất cả ({scopedItems.length})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUsageFilter('used')}>Đang dùng ({counts.used})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUsageFilter('unused')}>Chưa gắn ({counts.unused})</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Nút đặt lại bộ lọc */}
        <Button size="sm" variant="tertiary" disabled={!hasActiveFilter} className="h-8 gap-1.5 whitespace-nowrap text-[12.5px]" onClick={resetFilters}>
            <RotateCcw className="size-3" /> Đặt lại bộ lọc
          </Button>

        <span className="ml-auto text-[12.5px] text-[var(--stone)]">
          {hasActiveFilter ? (
            <>
              Đang hiện <strong>{filteredItems.length}</strong>/{scopedItems.length} proxy
            </>
          ) : (
            <>{scopedItems.length} proxy</>
          )}
        </span>
      </div>

      {/* Bảng danh sách proxy */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
        {/* Table tu tao vung cuon (overflow-auto) — khong boc them div overflow nua,
            neu khong thead sticky se khong dinh */}
        <Table viewportRef={virtual.viewportRef} aria-rowcount={sortedItems.length + 1} className="min-w-[1120px] table-fixed">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '23%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: 60 }} />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-[var(--surface)]">
                <TableHead className="px-2 text-center">
                  <Checkbox
                    checked={
                      filteredItems.length > 0 && selectedFilteredCount === filteredItems.length
                        ? true
                        : selectedFilteredCount > 0
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={toggleSelectAll}
                    aria-label="Chọn tất cả proxy đang hiển thị"
                  />
                </TableHead>
                <TableHead>Tên</TableHead>
                <TableHead>Chuỗi proxy</TableHead>
                <TableHead>Kết quả test gần nhất</TableHead>
                <TableHead>Lịch sử test</TableHead>
                <TableHead>Tài khoản đang dùng</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-[var(--steel)]">
                    Chưa có proxy nào — bấm “Thêm proxy” hoặc “Dán hàng loạt” rồi gán cho tài khoản ở tab Tài khoản.
                  </TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center text-[var(--steel)]">
                    <div className="flex flex-col items-center gap-2">
                      <span>Không có proxy nào khớp với bộ lọc hiện tại.</span>
                      <Button size="sm" variant="tertiary" onClick={resetFilters}>
                        Đặt lại bộ lọc
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                <>
                {virtual.paddingTop > 0 && <tr aria-hidden="true"><td colSpan={7} style={{ height: virtual.paddingTop, padding: 0, border: 0 }} /></tr>}
                {sortedItems.slice(virtual.start, virtual.end).map((p, index) => {
                  const users = usersOf(p.id)
                  const t = p.lastTest
                  const selected = selectedSet.has(p.id)
                  return (
                    <ContextMenu key={p.id}>
                      <ContextMenuTrigger asChild>
                        <TableRow
                          data-proxy-id={p.id}
                          aria-rowindex={virtual.start + index + 2}
                          data-state={selected ? 'selected' : undefined}
                          className="h-14 cursor-pointer [&>td]:h-14 [&>td]:overflow-hidden [&>td]:py-1"
                          onClick={() => toggleSelectOne(p.id)}
                        >
                      <TableCell className="px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleSelectOne(p.id)}
                          aria-label={`Chọn proxy ${p.label}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex h-11 min-w-0 flex-col justify-center overflow-hidden">
                          <div className="flex min-w-0 items-center gap-1"><span className="truncate font-medium">{p.label}</span>
                          {p.status && p.status !== 'active' ? <Badge variant="secondary" className="h-5 shrink-0">{p.status === 'blacklisted' ? 'Blacklist' : 'Không dùng'}</Badge> : null}</div>
                          {p.note ? <div className="mm-micro truncate" title={p.note}>{p.note}</div> : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <code className="block truncate text-[11.5px] text-[var(--steel)]" title={p.url}>{p.url}</code>
                      </TableCell>
                      <TableCell>
                        <div className={`flex h-11 min-w-0 flex-col justify-center gap-0.5 overflow-hidden rounded-lg px-2 ${!t ? 'bg-[var(--surface)]' : t.ok ? 'bg-emerald-50/70' : 'bg-rose-50/70'}`}>
                          {!t ? (
                            <div className="flex items-center gap-1.5 text-[12px] text-[var(--stone)]"><Wifi className="size-3.5" /> Chưa kiểm tra</div>
                          ) : (
                            <>
                              <div className="flex h-5 min-w-0 items-center gap-1.5">
                                <Badge variant={t.ok ? 'success' : 'destructive'} className="h-5 gap-1 px-1.5 text-[11px]">
                                  {t.ok ? <Check className="size-3" /> : <X className="size-3" />}{t.ok ? 'Sống' : 'Lỗi'}
                                </Badge>
                                {t.ok ? (
                                  <span className="mm-tabular min-w-0 truncate text-[12px] font-medium text-[var(--slate)]" title={t.ip}>{t.ip || 'Chưa rõ IP'}</span>
                                ) : (
                                  <span className="min-w-0 truncate text-[12px] font-medium text-rose-700" title={t.error}>{proxyErrorLabel(t.error)}</span>
                                )}
                                {t.ok && t.latency != null ? (
                                  <Badge variant={t.latency <= 1000 ? 'success' : 'warning'} className="mm-tabular ml-auto h-5 px-1.5 text-[11px]" title="Độ trễ phản hồi">
                                    {t.latency} ms
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="flex h-4 min-w-0 items-center gap-1.5 text-[11px] text-[var(--steel)]">
                                {t.ok ? (
                                  <span className="flex min-w-0 flex-1 items-center gap-1" title={[t.country, t.city].filter(Boolean).join(', ')}>
                                    <MapPin className="size-3 shrink-0 text-emerald-600" />
                                    <span className="truncate">{[t.country, t.city].filter(Boolean).join(', ') || 'Chưa rõ vị trí'}</span>
                                  </span>
                                ) : <span className="min-w-0 flex-1 truncate" title={t.error}>Kết nối thất bại</span>}
                                <span className="flex shrink-0 items-center gap-1" title={`Kiểm tra lúc ${new Date(t.at).toLocaleString('vi-VN')}`}><Clock3 className="size-3" />{timeAgo(t.at)}</span>
                              </div>
                            </>
                          )}
                        </div>
                      </TableCell>
                      {/* Lịch sử test: số lần sống/chết + tỉ lệ + chuỗi thất bại */}
                      <TableCell className="text-left" onClick={(e) => e.stopPropagation()}>
                        {(() => {
                          const s = stats[p.id]
                          if (!s || s.total === 0) {
                            return <div className="flex h-11 items-center gap-1.5 text-[12px] text-[var(--stone)]"><History className="size-3.5" /> Chưa có lịch sử</div>
                          }
                          const rate = s.successRate ?? 0
                          const tone = rate >= 50 ? 'success' : rate > 0 ? 'warning' : 'destructive'
                          return (
                            <div className="mm-tabular flex h-11 min-w-0 flex-col justify-center gap-0.5">
                              <div className="flex h-4 min-w-0 items-center justify-between gap-1.5" title={`Thành công ${s.ok} lần · thất bại ${s.fail} lần · tổng ${s.total} lần test`}>
                                <span className="min-w-0 truncate text-[12px] text-[var(--steel)]"><span className="font-semibold text-emerald-700">{s.ok} sống</span><span className="mx-1 text-[var(--stone)]">/</span><span className="font-medium text-rose-600">{s.fail} lỗi</span></span>
                                <Badge className="h-4 min-w-10 px-1.5 text-[11px]" variant={tone}>{s.successRate ?? '—'}{s.successRate != null ? '%' : ''}</Badge>
                              </div>
                              <div className="flex h-1 w-full shrink-0 overflow-hidden rounded-full bg-rose-100" role="img" aria-label={`Tỷ lệ test thành công ${rate}%`}>
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max(0, Math.min(100, rate))}%` }} />
                              </div>
                              <div className="flex h-5 min-w-0 items-center justify-between gap-1">
                                <Button size="sm" variant="tertiary" className="h-5 shrink-0 gap-1 border-[var(--hairline)] px-1.5 text-[11px] text-[var(--brand-blue-deep)] hover:bg-blue-50" onClick={() => setHistoryOf(p)} aria-label={`Xem lịch sử test của ${p.label}`}>
                                  <History className="size-3" /> Xem lịch sử
                                </Button>
                                {s.failStreak >= 3 ? (
                                  <Badge variant={s.dead10 ? 'destructive' : 'warning'} className="h-5 min-w-0 px-1.5 text-[10.5px]" title={`${s.failStreak} lần lỗi liên tiếp${s.dead10 ? ' — nên thay hoặc xoá proxy' : ''}`}>
                                    <span className="truncate">{s.dead10 ? 'Chết' : 'Lỗi'} ×{s.failStreak}</span>
                                  </Badge>
                                ) : <span className="truncate text-[10.5px] text-[var(--stone)]" title={`${s.total} lần kiểm tra`}>{s.total} lần test</span>}
                              </div>
                            </div>
                          )
                        })()}
                      </TableCell>
                      <TableCell>
                        {users.length === 0 ? (
                          <span className="text-[12px] text-[var(--stone)]">Chưa gắn tài khoản</span>
                        ) : (
                          <div className="flex h-10 min-w-0 flex-col justify-center gap-0.5 overflow-hidden" title={users.map((u) => `${u.profile.name} (${u.profile.proxyId === p.id || u.profile.proxy === p.url ? 'chính' : 'dự phòng'})`).join('\n')}>
                            <div className="flex h-5 min-w-0 items-center gap-1">
                              <span className="min-w-0 truncate text-[12px] font-medium">{users[0].profile.name}</span>
                              {users.length > 1 ? <Badge variant="secondary" className="mm-tabular h-5 px-1.5 text-[11px]">+{users.length - 1}</Badge> : null}
                            </div>
                            <span className="h-4 truncate text-[11.5px] text-[var(--stone)]">
                              {users.length > 1 ? `${users.length} tài khoản đang dùng` : users[0].profile.proxyId === p.id || users[0].profile.proxy === p.url ? 'Proxy chính' : 'Proxy dự phòng'}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-sm" variant="tertiary" title="Thao tác với proxy" aria-label={`Thao tác với ${p.label}`}>
                              <MoreHorizontal className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
<DropdownMenuContent className="min-w-[240px]">
                        <DropdownMenuLabel className="text-[12px] font-semibold text-[var(--steel)]">
                          {p.label}
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {(['active', 'unused', 'blacklisted'] as const).map(status => (
                          <DropdownMenuItem key={status} disabled={(p.status ?? 'active') === status || !!busy} onClick={() => void setProxyStatus([p.id], status)}>
                            {status === 'active' ? 'Bật lại' : status === 'unused' ? 'Không dùng (bỏ qua kiểm tra)' : 'Đưa vào blacklist'}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem className="gap-2" disabled={busy === `test:${p.id}` || !!testProgress || (!!p.status && p.status !== 'active')} onClick={() => void testOne(p.id)}>
                          <Wifi className="size-3.5" /> Kiểm tra proxy này
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => {
                            void navigator.clipboard.writeText(p.url)
                            toast.success('Đã copy chuỗi proxy.')
                          }}
                        >
                          <ClipboardPaste className="size-3.5" /> Copy chuỗi proxy
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="gap-2"
                          onClick={() => {
                            setEditing(p)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="size-3.5" /> Sửa proxy
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2"
                          disabled={!!p.status && p.status !== 'active'}
                          onClick={() => {
                            setAssignTarget(p)
                            setAssignOpen(true)
                          }}
                        >
                          <UserPlus className="size-3.5" /> Gán tài khoản vào proxy này
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="gap-2 text-[var(--error)]"
                          onClick={() => deleteOne(p)}
                        >
                          <Trash2 className="size-3.5" /> Xoá khỏi kho
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                        </TableRow>
                      </ContextMenuTrigger>

                      <ContextMenuContent className="min-w-[240px]">
                        <ContextMenuLabel className="text-[12px] font-semibold text-[var(--steel)]">
                          {p.label}
                        </ContextMenuLabel>
                        <ContextMenuSeparator />
                        {(['active', 'unused', 'blacklisted'] as const).map(status => (
                          <ContextMenuItem key={status} disabled={(p.status ?? 'active') === status || !!busy} onClick={() => void setProxyStatus([p.id], status)}>
                            {status === 'active' ? 'Bật lại' : status === 'unused' ? 'Không dùng (bỏ qua kiểm tra)' : 'Đưa vào blacklist'}
                          </ContextMenuItem>
                        ))}
                        <ContextMenuItem className="gap-2" disabled={busy === `test:${p.id}` || !!testProgress || (!!p.status && p.status !== 'active')} onClick={() => void testOne(p.id)}>
                          <Wifi className="size-3.5" /> Kiểm tra proxy này
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="gap-2"
                          onClick={() => {
                            void navigator.clipboard.writeText(p.url)
                            toast.success('Đã copy chuỗi proxy.')
                          }}
                        >
                          <ClipboardPaste className="size-3.5" /> Copy chuỗi proxy
                        </ContextMenuItem>
                        <ContextMenuItem
                          className="gap-2"
                          onClick={() => {
                            setEditing(p)
                            setDialogOpen(true)
                          }}
                        >
                          <Pencil className="size-3.5" /> Sửa proxy
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="gap-2"
                          disabled={!!p.status && p.status !== 'active'}
                          onClick={() => {
                            setAssignTarget(p)
                            setAssignOpen(true)
                          }}
                        >
                          <UserPlus className="size-3.5" /> Gán tài khoản vào proxy này
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="gap-2 text-[var(--error)]"
                          onClick={() => deleteOne(p)}
                        >
                          <Trash2 className="size-3.5" /> Xoá khỏi kho
                        </ContextMenuItem>
                      </ContextMenuContent>
                    </ContextMenu>
                  )
                })}
                {virtual.paddingBottom > 0 && <tr aria-hidden="true"><td colSpan={7} style={{ height: virtual.paddingBottom, padding: 0, border: 0 }} /></tr>}
                </>
              )}
            </TableBody>
          </Table>
      </div>

      {/* Dòng trạng thái đáy bảng */}
      <div className="mm-tabular flex h-9 shrink-0 items-center justify-between gap-4 overflow-hidden whitespace-nowrap border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--steel)]">
        <span>
          {filteredItems.length} proxy{hasActiveFilter ? ` (đã lọc từ ${scopedItems.length})` : ''} ·{' '}
          {counts.ok} hoạt động · {counts.error} lỗi · {counts.untested} chưa test
          {sortBy !== 'default' ? ` · sắp xếp: ${sortLabels[sortBy].split(' (')[0]}` : ''}
        </span>
        <span>
          {rows.filter((r) => r.profile.proxyId).length} tài khoản đang gắn proxy
        </span>
      </div>

      <ProxyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={async (patch) => {
          if (editing) {
            const r = await window.api.updateProxy(editing.id, patch)
            if (!r.ok) throw new Error(r.error)
            toast.success('Đã lưu proxy.')
          } else {
            const r = await window.api.addProxy(patch)
            if (!r.ok) throw new Error(r.error)
            toast.success('Đã thêm proxy vào kho.')
          }
          await reload()
          onChanged()
        }}
      />

      <BulkProxyDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onSubmit={async (lines) => {
          const r = await window.api.addProxyBulk(lines)
          if (!r.ok) throw new Error(r.error)
          toast.success(`Đã thêm ${r.added} proxy${r.skipped ? `, bỏ qua ${r.skipped} dòng trùng` : ''}.`)
          await reload()
          onChanged()
        }}
      />

      <AssignProxyDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        proxy={assignTarget}
        rows={rows}
        proxyLabels={Object.fromEntries(items.map((p) => [p.id, p.label]))}
        onSave={assignTo}
      />

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />

      {/* Lịch sử test của 1 proxy: từng lần sống/chết, ping, IP, lỗi */}
      <Dialog open={!!historyOf} onOpenChange={(o) => !o && setHistoryOf(null)}>
        <DialogContent className="max-w-2xl gap-0 p-0">
          <DialogHeader className="border-b border-[var(--hairline-soft)] px-4 py-3">
            <DialogTitle className="text-[15px]">Lịch sử test — {historyOf?.label}</DialogTitle>
            <DialogDescription className="text-[12.5px]">
              {(() => {
                const s = historyOf ? stats[historyOf.id] : null
                if (!s || s.total === 0) return 'Proxy này chưa có lần test nào được ghi.'
                return `Sống ${s.ok}/${s.total} lần (${s.successRate}%) · lỗi liên tiếp gần nhất: ${s.failStreak} lần${
                  s.dead10 ? ' · ⚠ 10 lần gần nhất đều chết, nên xoá' : ''
                }`
              })()}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto px-4 py-3">
            {(() => {
              const s = historyOf ? stats[historyOf.id] : null
              const attempts = s?.attempts ?? []
              if (!attempts.length) {
                return <div className="py-8 text-center text-[12.5px] text-[var(--steel)]">Chưa có dữ liệu.</div>
              }
              return (
                <div className="flex flex-col gap-1">
                  {[...attempts].reverse().map((a, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--hairline)] bg-[var(--surface)]/40 px-2 py-1 text-[12px]"
                    >
                      <span className="mm-tabular shrink-0 text-[11.5px] text-[var(--stone)]">
                        {new Date(a.at).toLocaleString('vi-VN')}
                      </span>
                      <Badge variant={a.ok ? 'success' : 'destructive'}>{a.ok ? 'SỐNG' : 'CHẾT'}</Badge>
                      {a.latency != null ? <span className="mm-tabular mm-micro">{a.latency}ms</span> : null}
                      {a.ip ? <span className="mm-tabular mm-micro">{a.ip}</span> : null}
                      {a.country ? <span className="mm-micro">{a.country}</span> : null}
                      {a.error ? (
                        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[var(--error)]" title={a.error}>
                          {a.error}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
          <DialogFooter className="flex-row items-center justify-between gap-2 border-t border-[var(--hairline-soft)] px-4 py-2.5">
            <Button
              variant="tertiary"
              size="sm"
              className="gap-1.5 text-[var(--error)]"
              onClick={() =>
                void act('clearHistory', async () => {
                  if (!historyOf) return
                  const r = await window.api.proxyHistoryClear([historyOf.id])
                  toast.success(`Đã xoá lịch sử test của proxy (${r.cleared} bản ghi).`)
                  setHistoryOf(null)
                  await reload()
                })
              }
            >
              <Trash2 className="size-3.5" /> Xoá lịch sử proxy này
            </Button>
            <Button variant="tertiary" size="sm" onClick={() => setHistoryOf(null)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
