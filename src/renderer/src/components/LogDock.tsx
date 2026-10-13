import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Eraser, Filter } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
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
  defaultOpen = false
}: {
  lines: LogLine[]
  running: boolean
  profileId: string | null
  profileName: string | null
  defaultOpen?: boolean
}): React.JSX.Element {
  const [open, setOpen] = useState(defaultOpen)
  const [onlyActive, setOnlyActive] = useState(true)
  const boxRef = useRef<HTMLDivElement>(null)

  const shown = useMemo(() => {
    if (!onlyActive || !profileId) return lines
    return lines.filter((l) => !l.profileId || l.profileId === profileId)
  }, [lines, onlyActive, profileId])

  useEffect(() => {
    const el = boxRef.current
    if (el && open) el.scrollTop = el.scrollHeight
  }, [shown.length, open])

  const last = shown[shown.length - 1]

  return (
    <div className="shrink-0 rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)]">
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
              <span className="text-[var(--stone)]">{last.at.slice(11)} </span>
              {last.msg}
            </>
          ) : (
            'chưa có log — bảng chỉ đọc số liệu đã lưu'
          )}
        </div>
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
          <div
            ref={boxRef}
            className="h-[170px] overflow-auto rounded-[8px] bg-[var(--surface)] p-2.5 font-mono text-[11.5px] leading-[1.55]"
          >
            {shown.length === 0 ? (
              <div className="text-[var(--stone)]">Không có dòng log nào.</div>
            ) : (
              shown.map((l, i) => (
                <div key={`${l.at}-${i}`} className={cn('whitespace-pre-wrap', LEVEL_CLASS[l.level] ?? '')}>
                  <span className="text-[var(--stone)]">{l.at.slice(11)} </span>
                  <span className="font-semibold uppercase opacity-70">[{l.level}]</span> {l.msg}
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function LogClearIcon(): React.JSX.Element {
  return <Eraser className="size-3.5" />
}
