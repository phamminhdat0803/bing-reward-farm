import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ChevronDown,
  ClipboardPaste,
  Filter,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
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
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { ProxyDialog } from '@renderer/components/ProxyDialog'
import { BulkProxyDialog } from '@renderer/components/BulkProxyDialog'
import { ConfirmDialog, type ConfirmRequest } from '@renderer/components/ConfirmDialog'
import { timeAgo } from '@renderer/lib/utils'
import type { ProxyItem, RowState } from '@shared/types'

type StatusFilter = 'all' | 'ok' | 'error' | 'untested'
type ProtocolFilter = 'all' | 'socks5' | 'socks4' | 'http'
type UsageFilter = 'all' | 'used' | 'unused'

const statusLabels: Record<StatusFilter, string> = {
  all: 'Tất cả',
  ok: 'Hoạt động',
  error: 'Lỗi',
  untested: 'Chưa test'
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

/** Tab "Proxy": kho proxy dùng chung, lọc tìm kiếm, test trực tiếp, xoá nhiều, biết tài khoản nào đang gắn. */
export function ProxyPanel({ rows, onChanged }: { rows: RowState[]; onChanged: () => void }): React.JSX.Element {
  const [items, setItems] = useState<ProxyItem[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [editing, setEditing] = useState<ProxyItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  // Bộ lọc
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [protocolFilter, setProtocolFilter] = useState<ProtocolFilter>('all')
  const [usageFilter, setUsageFilter] = useState<UsageFilter>('all')

  const reload = async (): Promise<void> => {
    const list = await window.api.listProxies()
    setItems(list)
    setSelectedIds((prev) => prev.filter((id) => list.some((x) => x.id === id)))
  }

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 30000)
    return () => window.clearInterval(t)
  }, [])

  const usersOf = (id: string): RowState[] => rows.filter((r) => r.profile.proxyId === id)

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

  const testOne = (id: string): Promise<void> =>
    act(`test:${id}`, async () => {
      const r = await window.api.testSavedProxy(id)
      if (r.ok) toast.success(`Proxy OK — IP ${r.ip}${r.country ? ` (${r.country})` : ''} · ${r.latency}ms`)
      else toast.error(`Proxy lỗi: ${r.error}`)
      await reload()
    })

  const testSelected = (): Promise<void> =>
    act('test-selected', async () => {
      if (!selectedIds.length) return
      toast.info(`Đang kiểm tra ${selectedIds.length} proxy đã chọn…`)
      const res = await window.api.testAllProxies(selectedIds)
      const ok = Object.values(res).filter((r) => r.ok).length
      toast.success(`Xong: ${ok}/${selectedIds.length} proxy hoạt động`)
      await reload()
    })

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

    for (const p of items) {
      if (!p.lastTest) untested++
      else if (p.lastTest.ok) ok++
      else error++

      const proto = getProxyProtocol(p.url)
      if (proto === 'socks5') socks5++
      else if (proto === 'socks4') socks4++
      else http++

      if (usersOf(p.id).length > 0) used++
      else unused++
    }

    return { ok, error, untested, socks5, socks4, http, used, unused }
  }, [items, rows])

  // Lọc danh sách proxy
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((p) => {
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
  }, [items, search, statusFilter, protocolFilter, usageFilter, rows])

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
    const visibleIds = filteredItems.map((p) => p.id)
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id))
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
    const selectedItems = items.filter((p) => selectedIds.includes(p.id))
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
      {/* Thanh thao tác chính */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 py-1.5">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-3.5" /> Thêm proxy
        </Button>
        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setBulkOpen(true)}>
          <ClipboardPaste className="size-3.5" /> Dán hàng loạt
        </Button>
        <span className="mx-1 h-5 w-px bg-[var(--hairline)]" />
        <Button
          size="sm"
          variant="tertiary"
          className="gap-1.5"
          disabled={!items.length || busy === 'all'}
          onClick={() =>
            void act('all', async () => {
              toast.info(`Đang kiểm tra ${items.length} proxy…`)
              const res = await window.api.testAllProxies()
              const ok = Object.values(res).filter((r) => r.ok).length
              toast.success(`Xong: ${ok}/${items.length} proxy hoạt động`)
              await reload()
            })
          }
        >
          <Wifi className={busy === 'all' ? 'size-3.5 animate-pulse' : 'size-3.5'} /> Kiểm tra tất cả
        </Button>
        <Button size="sm" variant="tertiary" className="gap-1.5" onClick={() => void reload()}>
          <RefreshCw className="size-3.5" /> Nạp lại
        </Button>

        {/* Các nút thao tác khi có proxy được chọn */}
        {selectedIds.length > 0 ? (
          <>
            <span className="mx-1 h-5 w-px bg-[var(--hairline)]" />
            <Badge variant="outline">{selectedIds.length} đã chọn</Badge>
            <Button
              size="sm"
              variant="tertiary"
              className="gap-1.5"
              disabled={busy === 'test-selected'}
              onClick={() => void testSelected()}
            >
              <Wifi className={busy === 'test-selected' ? 'size-3.5 animate-pulse' : 'size-3.5'} /> Kiểm tra đã chọn
            </Button>
            <Button size="sm" variant="danger" className="gap-1.5" onClick={deleteSelected}>
              <Trash2 className="size-3.5" /> Xoá đã chọn ({selectedIds.length})
            </Button>
            <Button
              size="sm"
              variant="tertiary"
              className="h-7 px-2 text-[12px]"
              onClick={() => setSelectedIds([])}
              title="Bỏ chọn tất cả"
            >
              <X className="size-3.5" /> Bỏ chọn
            </Button>
          </>
        ) : null}

        <span className="ml-auto text-[12.5px] text-[var(--stone)]">
          {items.length} proxy · {rows.filter((r) => r.profile.proxyId).length} tài khoản đã gắn
        </span>
      </div>

      {/* Thanh bộ lọc */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--surface)]/30 px-3 py-1.5">
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
            <Button size="sm" variant="tertiary" className="h-8 gap-1.5 text-[12.5px]">
              <Filter className="size-3 text-[var(--stone)]" />
              <span>
                Trạng thái: <strong>{statusLabels[statusFilter]}</strong>
              </span>
              <ChevronDown className="size-3 text-[var(--stone)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuItem onClick={() => setStatusFilter('all')}>Tất cả ({items.length})</DropdownMenuItem>
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
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dropdown Giao thức */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="h-8 gap-1.5 text-[12.5px]">
              <span>
                Giao thức: <strong>{protocolLabels[protocolFilter]}</strong>
              </span>
              <ChevronDown className="size-3 text-[var(--stone)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setProtocolFilter('all')}>
              Tất cả giao thức ({items.length})
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProtocolFilter('socks5')}>SOCKS5 ({counts.socks5})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProtocolFilter('socks4')}>SOCKS4 ({counts.socks4})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setProtocolFilter('http')}>HTTP / HTTPS ({counts.http})</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dropdown Sử dụng */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="tertiary" className="h-8 gap-1.5 text-[12.5px]">
              <span>
                Sử dụng: <strong>{usageLabels[usageFilter]}</strong>
              </span>
              <ChevronDown className="size-3 text-[var(--stone)]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuItem onClick={() => setUsageFilter('all')}>Tất cả ({items.length})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUsageFilter('used')}>Đang dùng ({counts.used})</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setUsageFilter('unused')}>Chưa gắn ({counts.unused})</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Nút đặt lại bộ lọc */}
        {hasActiveFilter ? (
          <Button size="sm" variant="tertiary" className="h-8 gap-1.5 text-[12.5px]" onClick={resetFilters}>
            <RotateCcw className="size-3" /> Đặt lại bộ lọc
          </Button>
        ) : null}

        <span className="ml-auto text-[12.5px] text-[var(--stone)]">
          {hasActiveFilter ? (
            <>
              Đang hiện <strong>{filteredItems.length}</strong>/{items.length} proxy
            </>
          ) : (
            <>{items.length} proxy</>
          )}
        </span>
      </div>

      {/* Bảng danh sách proxy */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="min-w-[1140px] table-fixed">
            <colgroup>
              <col style={{ width: 44 }} />
              <col style={{ width: 190 }} />
              <col style={{ width: 280 }} />
              <col style={{ width: 300 }} />
              <col style={{ width: 200 }} />
              <col style={{ width: 130 }} />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-[var(--surface)]">
                <TableHead className="w-[44px] px-2 text-center">
                  <Checkbox
                    checked={
                      filteredItems.length > 0 && filteredItems.every((p) => selectedIds.includes(p.id))
                        ? true
                        : filteredItems.some((p) => selectedIds.includes(p.id))
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
                <TableHead>Tài khoản đang dùng</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-[var(--steel)]">
                    Chưa có proxy nào — bấm “Thêm proxy” hoặc “Dán hàng loạt” rồi gán cho tài khoản ở tab Tài khoản.
                  </TableCell>
                </TableRow>
              ) : filteredItems.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-[var(--steel)]">
                    <div className="flex flex-col items-center gap-2">
                      <span>Không có proxy nào khớp với bộ lọc hiện tại.</span>
                      <Button size="sm" variant="tertiary" onClick={resetFilters}>
                        Đặt lại bộ lọc
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredItems.map((p) => {
                  const users = usersOf(p.id)
                  const t = p.lastTest
                  const selected = selectedIds.includes(p.id)
                  return (
                    <TableRow
                      key={p.id}
                      data-state={selected ? 'selected' : undefined}
                      className="cursor-pointer"
                      onClick={() => toggleSelectOne(p.id)}
                    >
                      <TableCell className="w-[44px] px-2 text-center" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={selected}
                          onCheckedChange={() => toggleSelectOne(p.id)}
                          aria-label={`Chọn proxy ${p.label}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="truncate font-medium">{p.label}</div>
                        {p.note ? <div className="mm-micro truncate">{p.note}</div> : null}
                      </TableCell>
                      <TableCell>
                        <code className="block truncate text-[11.5px] text-[var(--steel)]" title={p.url}>{p.url}</code>
                      </TableCell>
                      <TableCell>
                        {!t ? (
                          <span className="text-[12.5px] text-[var(--stone)]">chưa test</span>
                        ) : t.ok ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="success">OK</Badge>
                            <span className="mm-tabular text-[12.5px]">{t.ip}</span>
                            {t.country ? (
                              <span className="text-[12px] text-[var(--steel)]">
                                {t.country}
                                {t.city ? `, ${t.city}` : ''}
                              </span>
                            ) : null}
                            {t.latency ? <span className="mm-micro">{t.latency}ms</span> : null}
                            <span className="mm-micro">· {timeAgo(t.at)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <Badge variant="destructive" className="shrink-0">LỖI</Badge>
                            <span className="truncate text-[12px] text-[var(--error)]" title={t.error}>
                              {t.error}
                            </span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {users.length === 0 ? (
                          <span className="text-[12.5px] text-[var(--stone)]">chưa gắn</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {users.map((u) => (
                              <Badge key={u.id} variant="outline">
                                {u.profile.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Kiểm tra proxy này"
                            disabled={busy === `test:${p.id}`}
                            onClick={() => void testOne(p.id)}
                          >
                            <Wifi className={busy === `test:${p.id}` ? 'size-3.5 animate-pulse' : 'size-3.5'} />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Sửa proxy"
                            onClick={() => {
                              setEditing(p)
                              setDialogOpen(true)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Xoá proxy khỏi kho"
                            className="text-[var(--error)]"
                            onClick={() => deleteOne(p)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dòng trạng thái đáy bảng */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--steel)]">
        <span>
          {filteredItems.length} proxy{hasActiveFilter ? ` (đã lọc từ ${items.length})` : ''} ·{' '}
          {counts.ok} hoạt động · {counts.error} lỗi · {counts.untested} chưa test
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

      <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}
