import { RunHelpDialog, type RunHelpEntry } from './RunHelp'
import { explainRunMessage } from '@shared/run-guidance'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Eraser, Filter } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { cn } from '@renderer/lib/utils'
import type { LogLine } from '@shared/types'

const LEVEL_CLASS: Record<string, string> = {
  debug: 'text-[var(--stone)]',
  info: 'text-[var(--charcoal)]',
  warn: 'text-[#b45309]',
  error: 'text-[var(--error)]'
}

/**
 * Dock log ở đáy cửa sổ: thu gọn = 1 dòng trạng thái, mở ra = panel cao 220px.
 * Nhờ vậy bảng tài khoản giữ được toàn bộ chiều cao.
 */
export function LogDock({
  lines,
  running,
  profileId,
  profileName,
  profileNames = {},
  onNavigate,
  defaultOpen = false
}: {
  lines: LogLine[]
  running: boolean
  profileId: string | null
  profileName: string | null
  profileNames?: Record<string, string>
  onNavigate?: (destination: 'settings' | 'proxies') => void
  defaultOpen?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const [onlyActive, setOnlyActive] = useState(true)
  const [help, setHelp] = useState<RunHelpEntry | null>(null)
  const [follow, setFollow] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)

  const shown = useMemo(() => {
    if (!onlyActive || !profileId) return lines
    return lines.filter((l) => !l.profileId || l.profileId === profileId)
  }, [lines, onlyActive, profileId])

  useEffect(() => {
    const el = boxRef.current
    if (el && open && follow) el.scrollTop = el.scrollHeight
  }, [shown, open, follow])

  const last = shown[shown.length - 1]
  const guidance = useMemo(() => shown.map(line => explainRunMessage(line.msg)), [shown])
  const timeLabel = (at: string): string => /T.*(?:Z|[+-]\d\d:\d\d)$/.test(at) ? new Date(at).toLocaleTimeString('vi-VN') : at.slice(11)
  const helpFor = (line: LogLine): void => setHelp({ message: line.msg, at: line.at, profileName: line.profileId ? profileNames[line.profileId] ?? line.profileId : undefined })

  return (
    <div className="shrink-0 border-t border-[var(--hairline)] bg-[var(--canvas)]">
      <div className="flex items-center gap-2.5 px-3 py-1.5">
        <button
          className="flex items-center gap-2 text-[13px] font-semibold"
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Thu gọn log' : 'Mở log'}
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          Log
        </button>
        <Badge variant={running ? 'coral' : 'secondary'}>{running ? 'đang chạy' : 'rảnh'}</Badge>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px]',
            onlyActive
              ? 'border-[var(--ink)] text-[var(--ink)]'
              : 'border-[var(--hairline)] text-[var(--steel)]'
          )}
          onClick={() => setOnlyActive((v) => !v)}
          title="Chỉ hiện log của tài khoản đang chọn"
        >
          <Filter className="size-3" />
          {onlyActive ? `tài khoản: ${profileName ?? '—'}` : 'tất cả tài khoản'}
        </button>
        <div className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--steel)]">
          {last ? (
            <>
              <span className="text-[var(--stone)]">{timeLabel(last.at)} </span>
              {guidance[guidance.length - 1] ? `${guidance[guidance.length - 1]!.title}${guidance[guidance.length - 1]!.until ? ` · nghỉ đến ${guidance[guidance.length - 1]!.until}` : ''}` : last.msg}
            </>
          ) : (
            'chưa có log — bảng chỉ đọc số liệu đã lưu'
          )}
        </div>
        {last && guidance[guidance.length - 1] && <Button size="sm" variant="tertiary" className="h-6 px-2 text-[11px]" onClick={() => helpFor(last)}>Cách xử lý</Button>}
        <span className="shrink-0 text-[12px] text-[var(--stone)]">{shown.length} dòng</span>
        {open ? (
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => setOpen(false)}>
            Thu gọn
          </Button>
        ) : (
          <Button size="sm" variant="tertiary" onClick={() => setOpen(true)}>
            Mở log
          </Button>
        )}
      </div>

      {open ? (
        <div className="border-t border-[var(--hairline-soft)] p-2">
          <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--stone)]"><span>Bấm “Cách xử lý” cạnh thông báo để xem hướng dẫn.</span><Button size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={() => setFollow(value => !value)}>{follow ? 'Tạm dừng theo dõi' : 'Theo dõi mới nhất'}</Button></div>
          <ScrollArea viewportRef={boxRef} className="h-[170px] rounded-[8px] bg-[var(--surface)]">
            <div className="p-2.5 font-mono text-[11.5px] leading-[1.55]">
              {shown.length === 0 ? (
                <div className="text-[var(--stone)]">Không có dòng log nào.</div>
              ) : (
                shown.map((l, i) => (
                  <div key={`${l.at}-${i}`} className={cn('whitespace-pre-wrap py-0.5', LEVEL_CLASS[l.level] ?? '')}>
                    <span className="text-[var(--stone)]">{timeLabel(l.at)} </span>
                    {l.profileId && <span className="font-semibold text-[var(--steel)]">[{profileNames[l.profileId] ?? l.profileId}] </span>}
                    <span className="font-semibold uppercase opacity-70">[{l.level}]</span> <span title={l.msg}>{guidance[i] ? `${guidance[i]!.title}${guidance[i]!.until ? ` · nghỉ đến ${guidance[i]!.until}` : ''}` : l.msg}</span>
                    {guidance[i] && <Button size="sm" variant="tertiary" className="ml-2 h-5 px-2 align-middle text-[10.5px]" onClick={() => helpFor(l)}>Cách xử lý</Button>}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      ) : null}
      <RunHelpDialog entry={help} onClose={() => setHelp(null)} onNavigate={onNavigate} />
    </div>
  )
}

export function LogClearIcon(): React.JSX.Element {
  return <Eraser className="size-3.5" />
}
