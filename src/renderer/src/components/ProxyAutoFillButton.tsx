import { useEffect, useState } from 'react'
import { WandSparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import type { ProxyFillState } from '@shared/proxy-auto-fill'

export function ProxyAutoFillButton({ onChanged }: { onChanged: () => void }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState('1')
  const [rate, setRate] = useState('90')
  const [tests, setTests] = useState('10')
  const [sending, setSending] = useState(false)
  const [state, setState] = useState<ProxyFillState>({ running: false, done: 0, total: 0, rows: [] })
  useEffect(() => {
    void window.api.proxyAutoFillState().then(setState).catch(() => {})
  }, [])
  useEffect(() => {
    if (!open && !state.running) return
    let active = true, pending = false
    const timer = window.setInterval(() => {
      if (pending) return
      pending = true
      void window.api.proxyAutoFillState().then(next => {
        if (!active) return
        setState(next)
        if (state.running && !next.running) { onChanged(); toast.info('Đã hoàn tất tự gán và kiểm tra Bing. Xem kết quả từng tài khoản.') }
      }).catch(() => {}).finally(() => { pending = false })
    }, 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, state.running])
  const busy = sending || state.running
  return <>
    <Button size="sm" variant="tertiary" className="gap-1.5" onClick={() => setOpen(true)}><WandSparkles className="size-3.5" />{state.running ? `Tự gán proxy ${state.done}/${state.total}` : 'Tự gán proxy tốt'}</Button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden sm:max-w-[700px]">
        <DialogHeader><DialogTitle>Tự gán proxy tốt cho toàn bộ tài khoản</DialogTitle><DialogDescription>Ưu tiên tỷ lệ sống cao, nhiều lần test rồi độ trễ thấp. Mỗi proxy chỉ dành cho một tài khoản.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-[12px] font-medium">Số proxy / tài khoản<Input aria-label="Số proxy tự gán" type="number" min={1} max={20} value={count} disabled={busy} onChange={e => setCount(e.target.value)} /></label>
          <label className="grid gap-1 text-[12px] font-medium">Tỷ lệ sống tối thiểu (%)<Input aria-label="Tỷ lệ sống tối thiểu" type="number" min={1} max={100} value={rate} disabled={busy} onChange={e => setRate(e.target.value)} /></label>
          <label className="grid gap-1 text-[12px] font-medium">Số lần test tối thiểu<Input aria-label="Số lần test tối thiểu" type="number" min={1} max={10000} value={tests} disabled={busy} onChange={e => setTests(e.target.value)} /></label>
        </div>
        <p className="text-[12px] text-[var(--steel)]">Ví dụ 9 sống / 1 lỗi = 90%. Tổng N gồm 1 chính và N−1 dự phòng. Bỏ qua blacklist/không dùng, proxy lần test cuối lỗi và proxy của tài khoản khác.</p>
        <p className="text-[12px] text-[var(--steel)]">Thay danh sách proxy của các tài khoản đang rảnh. Tài khoản đang chạy/chờ hoặc browser đang mở sẽ được bỏ qua. Sau khi gán, kiểm tra Bing từng proxy; nếu không đạt thì khôi phục cấu hình cũ.</p>
        <div className="mm-tabular flex justify-between text-[12px] text-[var(--steel)]"><span>{state.running ? 'Đang gán và kiểm tra Bing…' : state.total ? 'Kết quả lượt gần nhất' : 'Chưa chạy'}</span><span>{state.done}/{state.total} tài khoản</span></div>
        {state.error && <p className="text-[12px] text-[var(--error)]">{state.error}</p>}
        <ScrollArea className="h-[240px] min-h-0 rounded-lg bg-[var(--surface)]">
          <div className="space-y-2 p-2 pr-3">{state.rows.map(row => <div key={row.profileId} className="border-b border-[var(--hairline-soft)] pb-2 text-[12px] last:border-0"><div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{row.name}</span><Badge variant={row.status === 'ok' ? 'success' : row.status === 'failed' ? 'destructive' : 'secondary'}>{row.status === 'ok' ? 'Bing OK' : row.status === 'skipped' ? 'Bỏ qua' : 'Không đổi'}</Badge></div><p className="mt-1 text-[var(--steel)]">{row.message}</p>{row.proxies.length > 0 && <p className="mt-1 truncate text-[var(--stone)]" title={row.proxies.join(' · ')}>{row.proxies.join(' · ')}</p>}</div>)}{!state.rows.length && <p className="py-8 text-center text-[12px] text-[var(--stone)]">Kết quả từng tài khoản sẽ hiện ở đây.</p>}</div>
        </ScrollArea>
        <DialogFooter><Button size="sm" variant="tertiary" onClick={() => setOpen(false)}>Đóng</Button><Button size="sm" disabled={busy} onClick={() => {
          setSending(true)
          void window.api.proxyAutoFill({ count: Number(count), minRate: Number(rate), minTests: Number(tests) }).then(setState).catch(e => toast.error((e as Error).message)).finally(() => setSending(false))
        }}>{busy ? 'Đang xử lý…' : 'Gán cho tất cả & kiểm tra Bing'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
