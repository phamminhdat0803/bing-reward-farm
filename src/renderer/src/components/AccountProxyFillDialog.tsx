import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, WandSparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import type { RowState } from '@shared/types'
import { proxyFillRunning, type AccountProxyFillJob } from '@shared/account-proxy-fill'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { ScrollArea } from './ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'

export function AccountProxyFillDialog({ row, open, onOpenChange, onChanged }: {
  row: RowState | null; open: boolean; onOpenChange: (value: boolean) => void; onChanged: () => void
}): React.JSX.Element {
  const [count, setCount] = useState('1')
  const [job, setJob] = useState<AccountProxyFillJob | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const notified = useRef<string | null>(null)
  const previousJob = useRef<AccountProxyFillJob | null>(null)
  const requestGeneration = useRef(0)
  const onChangedRef = useRef(onChanged)
  onChangedRef.current = onChanged
  const running = proxyFillRunning(job)
  useEffect(() => {
    if (job && previousJob.current?.id === job.id && proxyFillRunning(previousJob.current) && !proxyFillRunning(job) && notified.current !== job.id) {
      notified.current = job.id
      onChangedRef.current()
      if (job.status === 'completed') toast.success(`${job.name}: ${job.message}`)
      else toast.info(`${job.name}: ${job.message}`)
    }
    previousJob.current = job
  }, [job])
  useEffect(() => {
    setCount(String(Math.min(20, 1 + (row?.profile.proxyFallbacks?.length ?? 0))))
    setError('')
  }, [row?.id, open])
  useEffect(() => {
    if (!open && !running) return
    let active = true, pending = false
    const read = async (): Promise<void> => {
      if (pending) return
      pending = true
      const generation = requestGeneration.current
      try {
        const next = await window.api.accountProxyFillState()
        if (!active || generation !== requestGeneration.current) return
        setJob(next)
        if (next && next.profileId === row?.id && proxyFillRunning(next)) setCount(String(next.count))
      } catch { if (active) setError('Không đọc được tiến độ. Mở lại hộp thoại để kiểm tra trước khi thử tiếp.') }
      finally { pending = false }
    }
    void read()
    const timer = window.setInterval(() => void read(), 700)
    return () => { active = false; window.clearInterval(timer) }
  }, [open, running, row?.id])
  const ownJob = job?.profileId === row?.id ? job : null
  const validCount = Number.isSafeInteger(Number(count)) && Number(count) >= 1 && Number(count) <= 20
  const accountBusy = !!row && (row.browser.running || row.run.running)
  const busy = sending || running
  const start = async (): Promise<void> => {
    if (!row || !validCount) return
    requestGeneration.current++
    setSending(true); setError('')
    try { setJob(await window.api.accountProxyFill({ profileId: row.id, count: Number(count) })) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Không bắt đầu được kiểm tra proxy.') }
    finally { setSending(false) }
  }
  return <Dialog open={open && !!row} onOpenChange={onOpenChange}>
    <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden sm:max-w-[600px]">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2"><WandSparkles className="size-4" />Chọn và gán proxy</DialogTitle>
        <DialogDescription>Chỉ áp dụng cho <strong className="font-medium text-[var(--ink)]">{row?.profile.name}</strong>{row?.profile.account ? ` · ${row.profile.account}` : ''}.</DialogDescription>
      </DialogHeader>
      <label className="grid gap-1.5 text-[12px] font-medium">
        Số proxy cần gán
        <Input aria-label="Số proxy cho tài khoản" autoFocus type="number" min={1} max={20} step={1} value={count} disabled={busy} onChange={event => setCount(event.target.value)} aria-invalid={!validCount} />
      </label>
      <p className="text-[12px] text-[var(--steel)]">{validCount ? `${Number(count)} proxy = 1 chính${Number(count) > 1 ? ` + ${Number(count) - 1} dự phòng` : ''}.` : 'Nhập số nguyên từ 1 đến 20.'} Ưu tiên lịch sử tốt, kiểm tra mới từng proxy qua Bing và hiển thị độ trễ.</p>
      <p className="text-[12px] text-[var(--steel)]">Chọn proxy khác với danh sách đang gán; bỏ qua blacklist/không dùng, lần test cuối lỗi và proxy của tài khoản khác. Chỉ lưu khi tìm đủ số lượng đạt; thiếu thì giữ nguyên cấu hình cũ.</p>
      {accountBusy && <p className="text-[12px] text-[var(--error)]">Dừng tài khoản và đóng browser trước khi đổi proxy. Có thể đóng hộp thoại rồi quay lại.</p>}
      {running && !ownJob && <p role="status" className="text-[12px] text-[var(--steel)]">Đang kiểm tra cho {job?.name}. Chờ lượt đó hoàn tất trước khi bắt đầu lượt mới.</p>}
      {error && <p role="alert" className="text-[12px] text-[var(--error)]">{error}</p>}
      <div role="status" className="space-y-1 text-[12px]">
        <div className="mm-tabular flex items-center justify-between gap-3"><span className="font-medium">{ownJob && proxyFillRunning(ownJob) ? 'Đang kiểm tra kết nối…' : ownJob?.status === 'completed' ? 'Đã gán thành công' : 'Kết quả kiểm tra'}</span><span className="text-[var(--steel)]">{ownJob ? `${ownJob.checked} đã kiểm tra · ${ownJob.attempts.filter(item => item.ok).length}/${ownJob.count} đạt` : 'Chưa bắt đầu'}</span></div>
        {ownJob && <p className={ownJob.status === 'failed' ? 'text-[var(--error)]' : 'text-[var(--steel)]'}>{ownJob.message}</p>}
      </div>
      <ScrollArea className="h-[220px] min-h-0 shrink-0 border-y border-[var(--hairline-soft)]">
        <div className="divide-y divide-[var(--hairline-soft)] pr-3">
          {ownJob?.attempts.map((attempt, index) => {
            const assigned = ownJob.assigned.findIndex(item => item.proxyId === attempt.proxyId)
            return <div key={`${attempt.proxyId}-${index}`} className="flex items-center gap-2 py-2 text-[12px]">
              {attempt.ok ? <Check className="size-3.5 shrink-0 text-[var(--success-text)]" /> : <X className="size-3.5 shrink-0 text-[var(--error)]" />}
              <span className="min-w-0 flex-1 truncate" title={attempt.label}>{attempt.label}</span>
              {assigned >= 0 && <Badge variant={assigned === 0 ? 'success' : 'outline'}>{assigned === 0 ? 'Chính' : `Dự phòng ${assigned}`}</Badge>}
              <span className="mm-tabular shrink-0 text-[var(--steel)]">{attempt.ok ? `Bing OK · ${attempt.latency != null ? `${attempt.latency} ms` : 'chưa đo được độ trễ'}` : 'Không đạt'}</span>
            </div>
          })}
          {!ownJob?.attempts.length && <p className="py-10 text-center text-[12px] text-[var(--stone)]">Kết quả từng proxy sẽ hiện ở đây.</p>}
        </div>
      </ScrollArea>
      <DialogFooter className="items-center">
        <Button size="sm" variant="tertiary" onClick={() => onOpenChange(false)}>Đóng</Button>
        {ownJob && running ? <Button size="sm" variant="danger" disabled={ownJob.status === 'stopping'} onClick={() => {
          requestGeneration.current++
          void window.api.accountProxyFillCancel(ownJob.id).then(setJob).catch(() => setError('Chưa gửi được lệnh dừng. Thử lại.'))
        }}>{ownJob.status === 'stopping' ? 'Đang dừng…' : 'Dừng kiểm tra'}</Button> : <Button size="sm" disabled={!row || busy || !validCount || accountBusy} onClick={() => void start()}>
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}Kiểm tra & gán {validCount ? Number(count) : ''} proxy
        </Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
