import type { RowState } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { fmtNum } from '@renderer/lib/utils'

/** MiniMax `testimonial-stat-row`: dải số liệu tổng hợp phía trên bảng. */
export function StatStrip({ rows }: { rows: RowState[] }): React.JSX.Element {
  const withData = rows.filter((r) => r.cache)
  const totalPoints = withData.reduce((s, r) => s + (r.cache?.points ?? 0), 0)
  const today = withData.reduce((s, r) => s + (r.cache?.todayPoints ?? 0), 0)
  const cap = withData.reduce((s, r) => {
    const dMax = r.cache?.desktop?.max ?? r.profile.desktopMax ?? 0
    const mMax = r.cache?.mobile?.max ?? r.profile.mobileMax ?? (dMax <= 30 ? 0 : 0)
    const offers = r.cache?.offers ?? 30
    return s + dMax + mMax + offers
  }, 0)
  const running = rows.filter((r) => r.browser.running).length
  const needsRefresh = rows.filter((r) => r.needsRefresh).length

  const cells = [
    { label: 'Tổng điểm (đã lưu)', value: fmtNum(totalPoints) },
    { label: 'Điểm hôm nay', value: fmtNum(today), hint: cap ? `/ ${fmtNum(cap)} trần ngày` : undefined },
    { label: 'Tài khoản', value: `${rows.length}`, hint: `${withData.length} có dữ liệu` },
    { label: 'Trình duyệt đang mở', value: `${running}` }
  ]

  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {cells.map((c) => (
        <div key={c.label} className="min-w-[170px] flex-1 rounded-[12px] border border-[var(--hairline)] px-3.5 py-2">
          <div className="text-[12px] font-semibold text-[var(--steel)]">{c.label}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="mm-tabular text-[24px] font-semibold leading-tight tracking-[-0.5px]">{c.value}</span>
            {c.hint ? <span className="text-[12px] text-[var(--stone)]">{c.hint}</span> : null}
          </div>
        </div>
      ))}
      {needsRefresh > 0 ? (
        <div className="flex min-w-[170px] flex-1 items-center rounded-[12px] border border-[var(--hairline)] bg-[#fff4e5] px-3.5 py-2">
          <div>
            <Badge variant="warning">Sang ngày mới</Badge>
            <div className="mt-1 text-[12px] text-[#b45309]">
              {needsRefresh} tài khoản có số liệu của hôm qua — bấm “Cập nhật trạng thái”.
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
