import { Check, Wifi, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

export type ProxyTestState = { done: number; total: number; ok: number; error: number }

/** Vòng tiến độ tròn (SVG) — thay cho icon wifi xoay. */
function Ring({ pct, size = 48 }: { pct: number; size?: number }): React.JSX.Element {
  const r = (size - 6) / 2
  const c = 2 * Math.PI * r
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--hairline)" strokeWidth="3" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--brand-blue-deep)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * Math.min(100, Math.max(0, pct))) / 100}
        style={{ transition: 'stroke-dashoffset 200ms linear' }}
      />
    </svg>
  )
}

/**
 * Tiến độ kiểm tra proxy — cục tròn nổi ở góc phải dưới (cùng chỗ với FAB chạy kịch bản).
 * State nằm ở App nên chuyển tab qua lại vẫn giữ nguyên.
 */
export function ProxyTestFab({
  state,
  onStop
}: {
  state: ProxyTestState | null
  onStop: () => void
}): React.JSX.Element | null {
  if (!state) return null
  const pct = state.total > 0 ? Math.round((state.done / state.total) * 100) : 0
  const running = state.total === 0 || state.done < state.total

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-slot="proxy-test-fab"
          /* BUG 2026-10-16: dung hover:scale o day lam FAB doi kich thuoc -> Radix (floating-ui) tinh lai
             vi tri popover moi frame, popover nhay theo -> hover bi mat roi lai -> lap vo tan = "giat giat".
             Doi sang hover KHONG doi hinh hoc (shadow + vien). */
          className="relative flex size-12 items-center justify-center rounded-full border border-[var(--hairline)] bg-[var(--surface)] shadow-[0_8px_24px_rgba(0,0,0,0.18)] transition-[box-shadow,border-color] duration-150 hover:border-[var(--hairline-strong)] hover:shadow-[0_10px_28px_rgba(0,0,0,0.26)]"
          title={`Đang kiểm tra proxy ${state.done}/${state.total} (${pct}%) — bấm để xem chi tiết`}
          aria-label={`Đang kiểm tra proxy ${state.done} trên ${state.total}`}
        >
          <Ring pct={pct} />
          <span className="mm-tabular text-[12px] font-semibold text-[var(--ink)]">{pct}%</span>
          {running ? (
            <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[var(--brand-blue-deep)] text-[10.5px] font-semibold text-white">
              {state.total > 0 ? state.total : '…'}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side="top" sideOffset={8} className="w-[300px] p-0">
        <div className="flex items-center justify-between border-b border-[var(--hairline-soft)] px-3 py-2">
          <span className="flex items-center gap-1.5 text-[12.5px] font-semibold">
            <Wifi className="size-3.5 text-[var(--brand-blue-deep)]" /> Kiểm tra proxy
          </span>
          <span className="mm-micro">
            {state.done}/{state.total} · {pct}%
          </span>
        </div>

        <div className="p-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--hairline)]">
            <div
              className="h-full bg-[var(--brand-blue-deep)] transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>

          <div className="mt-2.5 flex items-center gap-3 text-[12px]">
            <span className="flex items-center gap-1 font-medium text-emerald-600">
              <Check className="size-3.5" /> {state.ok} hoạt động
            </span>
            <span className="flex items-center gap-1 font-medium text-[var(--error)]">
              <X className="size-3.5" /> {state.error} lỗi
            </span>
            <span className="ml-auto text-[var(--stone)]">còn {Math.max(0, state.total - state.done)}</span>
          </div>

          {running ? (
            <Button
              size="sm"
              variant="tertiary"
              className="mt-3 w-full gap-1.5 text-[12px] text-[var(--error)]"
              onClick={onStop}
            >
              <X className="size-3.5" /> Dừng kiểm tra
            </Button>
          ) : (
            <div className="mt-3 text-center text-[12px] text-[var(--success-text)]">Đã kiểm tra xong</div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
