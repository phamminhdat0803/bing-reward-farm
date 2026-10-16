import { Flame, Gift } from 'lucide-react'
import type { CachedSnapshot } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { fmtNum } from '@renderer/lib/utils'

export function RewardMetric({
  value,
  kind
}: {
  value: number | null | undefined
  kind: 'streak' | 'claim'
}): React.JSX.Element {
  if (value == null) {
    return (
      <span className="text-[12px] text-[var(--stone)]" title="Bấm Cập nhật trạng thái để đọc từ Microsoft Rewards">
        {value === undefined ? 'Chưa cập nhật' : 'Chưa đọc được'}
      </span>
    )
  }
  return (
    <Badge variant={value > 0 ? (kind === 'streak' ? 'warning' : 'success') : 'secondary'} className="mm-tabular">
      {kind === 'streak' ? <Flame className="size-3" /> : <Gift className="size-3" />}
      {fmtNum(value)}{kind === 'streak' ? ' ngày' : ' chờ nhận'}
    </Badge>
  )
}

export function RewardsSummary({ cache }: { cache: CachedSnapshot | null }): React.JSX.Element {
  return (
    <section aria-label="Chuỗi ngày và phần thưởng" data-slot="rewards-summary" className="grid grid-cols-2 gap-2">
      <div className="min-w-0 rounded-[16px] border border-[var(--hairline)] bg-white p-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--steel)]">
          <Flame className="size-3.5 text-[#b45309]" /> Daily streak
        </div>
        <div className="mm-tabular mt-2 flex h-8 items-baseline gap-1.5">
          <span className="text-[26px] font-semibold leading-none">{fmtNum(cache?.dailyStreak)}</span>
          {cache?.dailyStreak != null ? <span className="text-[12px] text-[var(--steel)]">ngày liên tiếp</span> : null}
        </div>
        <p className="mt-1 text-[11.5px] text-[var(--steel)]">
          {cache?.dailyStreak == null ? 'Cập nhật để đọc chuỗi ngày' : 'Nguồn: trang Earn'}
        </p>
      </div>
      <div className="min-w-0 rounded-[16px] border border-[var(--hairline)] bg-white p-3">
        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--steel)]">
          <Gift className="size-3.5 text-[var(--success-text)]" /> Ready to claim
        </div>
        <div className="mm-tabular mt-2 flex h-8 items-baseline gap-1.5">
          <span className={'text-[26px] font-semibold leading-none ' + ((cache?.readyToClaim ?? 0) > 0 ? 'text-[var(--success-text)]' : '')}>
            {fmtNum(cache?.readyToClaim)}
          </span>
          {cache?.readyToClaim != null ? <span className="text-[12px] text-[var(--steel)]">chờ nhận</span> : null}
        </div>
        <p className="mt-1 text-[11.5px] text-[var(--steel)]">
          {cache?.readyToClaim == null
            ? 'Cập nhật để đọc phần thưởng'
            : cache.readyToClaim === 0
              ? 'Chưa có phần thưởng chờ nhận'
              : 'Nguồn: trang Dashboard'}
        </p>
      </div>
    </section>
  )
}
