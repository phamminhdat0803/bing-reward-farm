import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import type { ProxyItem, RowState } from '@shared/types'

/** Gán 1 proxy cho nhiều tài khoản: tick tài khoản nào thì proxy này áp cho tài khoản đó. */
export function AssignProxyDialog({
  open,
  onOpenChange,
  proxy,
  rows,
  proxyLabels,
  onSave
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  proxy: ProxyItem | null
  rows: RowState[]
  proxyLabels: Record<string, string>
  /** danh sách id tài khoản sẽ dùng proxy này */
  onSave: (ids: string[]) => Promise<void>
}): React.JSX.Element {
  const [selected, setSelected] = useState<string[] | null>(null)
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  // mỗi lần mở: mặc định = các tài khoản đang gắn proxy này
  const initial = useMemo(
    () => (open && proxy ? rows.filter((r) => r.profile.proxyId === proxy.id).map((r) => r.id) : []),
    [open, proxy, rows]
  )
  const current = selected ?? initial

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return rows
    return rows.filter(
      (r) =>
        r.profile.name.toLowerCase().includes(needle) ||
        (r.profile.account ?? '').toLowerCase().includes(needle)
    )
  }, [rows, q])

  const toggle = (id: string): void => {
    const base = selected ?? initial
    setSelected(base.includes(id) ? base.filter((x) => x !== id) : [...base, id])
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setSelected(null)
        onOpenChange(v)
      }}
    >
      <DialogContent className="z-[70] flex! h-[70vh] max-h-[70vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="shrink-0 border-b border-[var(--hairline-soft)] px-5 py-3.5 pr-12 text-left">
          <DialogTitle className="text-[19px] leading-tight">Gán tài khoản vào proxy</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            {proxy ? (
              <>
                Proxy: <b>{proxy.label}</b> — tick tài khoản sẽ dùng proxy này; bỏ tick sẽ gỡ proxy khỏi tài khoản đó.
              </>
            ) : (
              'Chưa chọn proxy'
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="shrink-0 border-b border-[var(--hairline-soft)] px-5 py-2.5">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm tài khoản…"
            className="h-8 text-[12.5px]"
          />
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="p-2">
            {list.length === 0 ? (
              <div className="px-2.5 py-6 text-center text-[12.5px] text-[var(--steel)]">
                Không có tài khoản nào khớp.
              </div>
            ) : (
              list.map((r) => {
                const on = current.includes(r.id)
                const otherProxy =
                  r.profile.proxyId && r.profile.proxyId !== proxy?.id
                    ? (proxyLabels[r.profile.proxyId] ?? r.profile.proxyId)
                    : null
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => toggle(r.id)}
                    className={
                      'flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2 text-left transition ' +
                      (on ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]')
                    }
                  >
                    <Checkbox checked={on} onCheckedChange={() => toggle(r.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-medium whitespace-nowrap">{r.profile.name}</div>
                      <div className="mm-micro truncate">{r.profile.account || r.profile.id}</div>
                    </div>
                    {otherProxy ? (
                      <Badge variant="outline" title={`Đang dùng: ${otherProxy}`}>
                        đang dùng proxy khác
                      </Badge>
                    ) : null}
                    {on ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 gap-2 border-t border-[var(--hairline-soft)] px-5 py-3">
          <span className="mr-auto text-[12px] text-[var(--stone)]">Đã chọn {current.length} tài khoản</span>
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            disabled={busy || !proxy}
            onClick={async () => {
              setBusy(true)
              try {
                await onSave(current)
                setSelected(null)
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            Lưu
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
