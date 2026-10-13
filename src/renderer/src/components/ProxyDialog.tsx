import { Check } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { useState, useEffect } from 'react'
import type { ProxyItem, ProxyTestResult } from '@shared/types'

/** Hop them / sua proxy trong kho (tab "Proxy"). */
export function ProxyDialog({
  open,
  onOpenChange,
  initial,
  onSubmit
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: ProxyItem | null
  onSubmit: (patch: Partial<ProxyItem>) => Promise<void>
}): React.JSX.Element {
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ProxyTestResult | null>(null)

  useEffect(() => {
    if (!open) return
    setLabel(initial?.label ?? '')
    setUrl(initial?.url ?? '')
    setNote(initial?.note ?? '')
    setResult(initial?.lastTest ?? null)
  }, [open, initial])

  const test = async (): Promise<void> => {
    if (!url.trim()) return
    setTesting(true)
    setResult(null)
    try {
      setResult(await window.api.testProxy(url.trim()))
    } finally {
      setTesting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="text-[20px] leading-tight">
            {initial ? 'Sửa proxy' : 'Thêm proxy'}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Proxy lưu một lần rồi gán cho tài khoản — không phải gõ lại chuỗi proxy cho từng acc.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="p-label">Tên gợi nhớ</Label>
              <Input
                id="p-label"
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ví dụ: US-01"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="p-note">Ghi chú</Label>
              <Input id="p-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="tuỳ chọn" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="p-url">Chuỗi proxy</Label>
              <Button
                type="button"
                variant="tertiary"
                size="sm"
                className="h-6 gap-1 px-2.5 text-[11.5px]"
                disabled={testing || !url.trim()}
                onClick={() => void test()}
              >
                {testing ? 'Đang kiểm tra…' : 'Kiểm tra ngay'}
              </Button>
            </div>
            <Input
              id="p-url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value)
                setResult(null)
              }}
              placeholder="http://user:pass@host:port · socks5://host:port · host:port:user:pass"
            />
            {result ? (
              <div
                className={
                  'flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] ' +
                  (result.ok
                    ? 'bg-[var(--success-bg)] text-[var(--success-text)]'
                    : 'bg-[#fdf2f2] text-[var(--error)]')
                }
              >
                {result.ok ? (
                  <>
                    <Check className="size-3.5" />
                    <span className="font-semibold">IP: {result.ip}</span>
                    {result.country ? (
                      <span>
                        ({result.country}
                        {result.city ? `, ${result.city}` : ''})
                      </span>
                    ) : null}
                    {result.latency ? <span className="opacity-70">· {result.latency}ms</span> : null}
                  </>
                ) : (
                  <span>✕ {result.error}</span>
                )}
              </div>
            ) : (
              <div className="mm-micro">
                Hỗ trợ HTTP, HTTPS, SOCKS5. Bỏ trống phần user:pass nếu proxy không cần xác thực.
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            disabled={busy || !url.trim()}
            onClick={async () => {
              setBusy(true)
              try {
                await onSubmit({
                  label: label.trim() || url.trim().split('@').pop()?.split(':')[0] || 'Proxy',
                  url: url.trim(),
                  note: note.trim() || undefined,
                  lastTest: result ? { ...result, at: new Date().toISOString() } : initial?.lastTest ?? null
                })
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            {initial ? 'Lưu thay đổi' : 'Thêm proxy'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
