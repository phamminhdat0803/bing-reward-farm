import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Label } from '@renderer/components/ui/label'

/** Dán nhiều proxy một lúc (mỗi dòng 1 proxy). Tự bỏ dòng trống, dòng trùng, dòng bắt đầu bằng #. */
export function BulkProxyDialog({
  open,
  onOpenChange,
  onSubmit
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSubmit: (lines: string[]) => Promise<void>
}): React.JSX.Element {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith('#'))

  const kinds = lines.reduce<Record<string, number>>((acc, l) => {
    const m = l.match(/^([a-z0-9]+):\/\//i)
    const k = (m?.[1] ?? 'http').toLowerCase()
    acc[k] = (acc[k] ?? 0) + 1
    return acc
  }, {})

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="z-[60] flex max-h-[86vh] flex-col overflow-hidden sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="text-[20px] leading-tight">Thêm proxy hàng loạt</DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Mỗi dòng một proxy. Hỗ trợ <code>http://</code>, <code>https://</code>, <code>socks4://</code>,{' '}
            <code>socks5://</code>, hoặc <code>host:port:user:pass</code>. Dòng trùng sẽ tự bỏ qua.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="bulk">Danh sách proxy</Label>
            <span className="text-[12px] text-[var(--stone)]">
              {lines.length} dòng
              {Object.entries(kinds).length
                ? ` · ${Object.entries(kinds)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(' · ')}`
                : ''}
            </span>
          </div>
          <textarea
            id="bulk"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            placeholder={'socks5://116.101.14.169:1088\nsocks4://27.65.28.116:1080\nhttp://203.205.49.2:10200\n# dong bat dau bang # se bi bo qua'}
            className="h-[280px] w-full resize-none rounded-[10px] border border-[var(--hairline)] bg-[var(--canvas)] p-2.5 font-mono text-[12px] leading-[1.6] text-[var(--ink)] outline-none focus:border-[var(--ink)]"
          />
        </div>

        <DialogFooter>
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            disabled={busy || lines.length === 0}
            onClick={async () => {
              setBusy(true)
              try {
                await onSubmit(lines)
                setText('')
                onOpenChange(false)
              } finally {
                setBusy(false)
              }
            }}
          >
            Thêm {lines.length} proxy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
