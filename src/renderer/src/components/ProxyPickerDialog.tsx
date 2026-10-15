import { useMemo, useRef, useState } from 'react'
import { ArrowUpDown, Check, Search, Wifi, Zap } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { ProxyItem, RowState } from '@shared/types'

type SortBy = 'latency-asc' | 'latency-desc' | 'label' | 'free'

const SORTS: Record<SortBy, string> = {
  'latency-asc': 'Độ trễ tăng dần',
  'latency-desc': 'Độ trễ giảm dần',
  label: 'Tên A → Z',
  free: 'Chưa gắn tài khoản trước'
}

/** Hộp chọn proxy: tìm kiếm + sắp xếp + thấy proxy nào đang gắn cho tài khoản nào. */
/** Lan chuot o bat ky dau trong modal cung cuon than dialog (khong phai tro dung vao vung cuon). */
function useWheelToScroll(): {
  ref: React.RefObject<HTMLDivElement | null>
  onWheel: (e: React.WheelEvent) => void
} {
  const ref = useRef<HTMLDivElement>(null)
  const onWheel = (e: React.WheelEvent): void => {
    const vp = ref.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    if (!vp) return
    const canScroll = vp.scrollHeight > vp.clientHeight + 1
    if (!canScroll) return
    vp.scrollTop += e.deltaY
  }
  return { ref, onWheel }
}

export function ProxyPickerDialog({
  open,
  onOpenChange,
  items,
  rows,
  value,
  onPick,
  onQuickFill3
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  items: ProxyItem[]
  rows: RowState[]
  value: string
  onPick: (id: string) => void
  onQuickFill3?: () => void
}): React.JSX.Element {
  const { ref: areaRef, onWheel } = useWheelToScroll()
  const [q, setQ] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('latency-asc')
  const [onlyFree, setOnlyFree] = useState(false)

  const usersOf = (p: ProxyItem): { name: string; isMain: boolean }[] => {
    const res: { name: string; isMain: boolean }[] = []
    for (const r of rows) {
      if (r.profile.proxyId === p.id || r.profile.proxy === p.url) {
        res.push({ name: r.profile.name, isMain: true })
      } else if (r.profile.proxyFallbacks?.includes(p.url)) {
        res.push({ name: r.profile.name, isMain: false })
      }
    }
    return res
  }

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const lat = (p: ProxyItem): number =>
      p.lastTest?.ok && p.lastTest.latency != null ? p.lastTest.latency : Number.POSITIVE_INFINITY
    let arr = items.filter((p) => {
      const t = p.lastTest
      if (onlyFree && usersOf(p).length > 0) return false
      if (!needle) return true
      return (
        p.label.toLowerCase().includes(needle) ||
        p.url.toLowerCase().includes(needle) ||
        (p.note ?? '').toLowerCase().includes(needle) ||
        (t?.ip ?? '').toLowerCase().includes(needle) ||
        (t?.country ?? '').toLowerCase().includes(needle) ||
        (t?.city ?? '').toLowerCase().includes(needle)
      )
    })
    arr = [...arr]
    if (sortBy === 'latency-asc') arr.sort((a, b) => lat(a) - lat(b))
    else if (sortBy === 'latency-desc')
      arr.sort((a, b) => {
        const la = lat(a)
        const lb = lat(b)
        if (la === Number.POSITIVE_INFINITY) return 1
        if (lb === Number.POSITIVE_INFINITY) return -1
        return lb - la
      })
    else if (sortBy === 'label') arr.sort((a, b) => a.label.localeCompare(b.label))
    else arr.sort((a, b) => usersOf(a).length - usersOf(b).length)
    return arr
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, rows, q, sortBy, onlyFree])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onWheel={onWheel} className="z-[70] flex! h-[80vh] max-h-[80vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[720px]">
        <DialogHeader className="shrink-0 border-b border-[var(--hairline-soft)] px-5 py-3.5 pr-12 text-left">
          <DialogTitle className="text-[19px] leading-tight">Chọn proxy</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Tìm theo tên, chuỗi proxy, IP, quốc gia. Cột phải cho biết proxy đang được tài khoản nào dùng.
          </DialogDescription>
        </DialogHeader>

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--hairline-soft)] px-5 py-2.5">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--stone)]" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm proxy…"
              className="h-8 pl-8 text-[12.5px]"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="tertiary" className="h-8 gap-1.5 text-[12.5px]">
                <ArrowUpDown className="size-3.5" /> {SORTS[sortBy]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              {(Object.keys(SORTS) as SortBy[]).map((k) => (
                <DropdownMenuItem key={k} className="gap-2" onClick={() => setSortBy(k)}>
                  {sortBy === k ? <Check className="size-3.5" /> : <span className="size-3.5" />}
                  {SORTS[k]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            size="sm"
            variant={onlyFree ? 'secondary' : 'tertiary'}
            className="h-8 text-[12.5px]"
            onClick={() => setOnlyFree((v) => !v)}
          >
            Chỉ proxy chưa gắn
          </Button>
          {onQuickFill3 ? (
            <Button
              size="sm"
              variant="secondary"
              className="h-8 gap-1.5 text-[12px] font-medium text-[var(--brand-blue-deep)]"
              onClick={() => {
                onQuickFill3()
                onOpenChange(false)
              }}
              title="Tự động chọn 3 proxy sạch có độ trễ thấp nhất"
            >
              <Zap className="size-3.5 fill-amber-500 text-amber-500" />
              ⚡ Gán nhanh 3 proxy sạch
            </Button>
          ) : null}
        </div>

        <ScrollArea ref={areaRef} className="min-h-0 flex-1">
          <div className="p-2">
            <button
              type="button"
              onClick={() => {
                onPick('')
                onOpenChange(false)
              }}
              className={
                'flex w-full items-center justify-between gap-3 rounded-[8px] px-2.5 py-2 text-left transition ' +
                (value === '' ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]')
              }
            >
              <div>
                <div className="text-[13px] font-semibold">Không dùng proxy</div>
                <div className="mm-micro">Đi trực tiếp bằng mạng của máy</div>
              </div>
              {value === '' ? <Check className="size-4 shrink-0" /> : null}
            </button>

            {list.length === 0 ? (
              <div className="px-2.5 py-6 text-center text-[12.5px] text-[var(--steel)]">
                Không có proxy nào khớp. Sang tab <b>Proxy</b> để thêm hoặc dán hàng loạt.
              </div>
            ) : (
              list.map((p) => {
                const t = p.lastTest
                const users = usersOf(p)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onPick(p.id)
                      onOpenChange(false)
                    }}
                    className={
                      'flex w-full items-start justify-between gap-3 rounded-[8px] px-2.5 py-2 text-left transition ' +
                      (value === p.id ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]')
                    }
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 whitespace-nowrap">
                        <span className="truncate text-[13px] font-semibold">{p.label}</span>
                        {t?.ok ? (
                          <Badge variant="success">{t.latency != null ? `${t.latency}ms` : 'OK'}</Badge>
                        ) : t ? (
                          <Badge variant="destructive">LỖI</Badge>
                        ) : (
                          <Badge variant="outline">chưa test</Badge>
                        )}
                      </div>
                      <div className="mm-micro truncate">{p.url}</div>
                      {t?.ok && t.ip ? (
                        <div className="mm-micro truncate">
                          <Wifi className="mr-1 inline size-3" />
                          {t.ip}
                          {t.country ? ` · ${t.country}` : ''}
                          {t.city ? `, ${t.city}` : ''}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex max-w-[240px] shrink-0 items-center justify-end gap-1.5">
                      {users.length === 0 ? (
                        <Badge variant="success" className="h-5 px-1.5 text-[11px] font-medium">
                          ✓ Sạch (chưa gắn)
                        </Badge>
                      ) : (
                        <div className="flex flex-wrap justify-end gap-1">
                          {users.map((u) => (
                            <Badge
                              key={u.name}
                              variant={u.isMain ? 'outline' : 'secondary'}
                              className={!u.isMain ? 'h-5 px-1.5 text-[11px] opacity-80' : 'h-5 px-1.5 text-[11px]'}
                              title={u.isMain ? 'Đang dùng làm proxy chính' : 'Đang dùng làm proxy dự phòng'}
                            >
                              {u.name}{!u.isMain ? ' (dự phòng)' : ''}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {value === p.id ? <Check className="size-4 shrink-0 text-[var(--brand-blue-deep)]" /> : null}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 gap-2 border-t border-[var(--hairline-soft)] px-5 py-3">
          <span className="mr-auto text-[12px] text-[var(--stone)]">{list.length} proxy</span>
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
