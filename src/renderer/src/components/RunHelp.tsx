import { useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { ScrollArea } from './ui/scroll-area'
import { explainRunMessage } from '@shared/run-guidance'

export type RunHelpEntry = { message: string; profileName?: string; at?: string }
export function RunHelpDialog({ entry, onClose, onNavigate }: { entry: RunHelpEntry | null; onClose: () => void; onNavigate?: (destination: 'settings' | 'proxies') => void }): React.JSX.Element {
  const guide = entry ? explainRunMessage(entry.message) : null
  return <Dialog open={!!entry && !!guide} onOpenChange={open => { if (!open) onClose() }}><DialogContent className="flex max-h-[86vh] flex-col overflow-hidden sm:max-w-[660px]">
    <DialogHeader><DialogTitle>{guide?.title}</DialogTitle><DialogDescription>{entry?.profileName ? `${entry.profileName} · ` : ''}Hướng dẫn dựa trên thông báo đã ghi. Trạng thái hiện tại có thể đã thay đổi.</DialogDescription></DialogHeader>
    <ScrollArea className="h-[min(420px,50vh)] min-h-0 shrink-0">
      <div className="space-y-3 pr-3 text-[12.5px] text-[var(--steel)]">
        <p>{guide?.explanation}</p>
        {guide?.until && <p className="font-medium text-[var(--ink)]">Thông báo ghi thời gian nghỉ đến {guide.until}. Nếu đã qua mốc này, cập nhật trạng thái để xem điều kiện còn chặn.</p>}
        {(guide?.target !== undefined || guide?.remaining !== undefined) && <div className="space-y-1 bg-[var(--surface)] p-3">{guide.target !== undefined && <p><strong>Mục tiêu search: {guide.target}%</strong> hạn mức điểm, không phải Bot score.</p>}{guide.remaining !== undefined && <p><strong>Còn {guide.remaining} lượt</strong> ngân sách trong ngày; không có nghĩa các lượt đó được chạy ngay.</p>}</div>}
        <ol className="list-decimal space-y-2 pl-5">{guide?.steps.map(step => <li key={step}>{step}</li>)}</ol>
        <details className="border-t border-[var(--hairline-soft)] pt-2"><summary className="cursor-pointer text-[12px]">Xem thông báo gốc{entry?.at ? ` · ${entry.at}` : ''}</summary><pre className="mt-2 whitespace-pre-wrap break-words text-[11px]">{entry?.message}</pre></details>
      </div>
    </ScrollArea>
    <DialogFooter><Button size="sm" variant="tertiary" onClick={onClose}>Đóng</Button>{guide?.destination && onNavigate && <Button size="sm" onClick={() => { const destination = guide.destination!; onClose(); onNavigate(destination) }}>{guide.destination === 'settings' ? 'Mở Cài đặt' : 'Mở tab Proxy'}</Button>}</DialogFooter>
  </DialogContent></Dialog>
}
export function RunHelpButton({ message, profileName }: { message: string; profileName?: string }): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  if (!explainRunMessage(message)) return null
  return <><Button size="sm" variant="tertiary" className="h-6 gap-1 px-2 text-[11px]" onClick={() => setOpen(true)}><CircleHelp className="size-3" /> Cách xử lý</Button><RunHelpDialog entry={open ? { message, profileName } : null} onClose={() => setOpen(false)} /></>
}
