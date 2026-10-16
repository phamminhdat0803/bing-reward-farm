import { Gauge } from 'lucide-react'
import type { SerpBotScore } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'

const dateTime = (value: string): string => new Date(value).toLocaleString('vi-VN')
const percentage = (value: number): string => (value * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })
const rawScore = (value: number): string => String(value)
const explanation = 'Chỉ số serpbotscore do API trả về trên thang 0–1; chưa có xác nhận đây là xác suất bị kết luận là bot.'

export function BotScoreBadge({ data }: { data?: SerpBotScore | null }): React.JSX.Element {
  const value = data?.value
  const title = value == null
    ? `${data?.error ?? 'Cập nhật trạng thái để đọc serpbotscore'}. Không suy ra 0 khi chưa đọc được.`
    : `${rawScore(value)} / 1 · ${percentage(value)}% trên thang điểm. ${explanation}\nNguồn cập nhật: ${data?.updatedAt ? dateTime(data.updatedAt) : 'không rõ'}\nĐọc lúc: ${dateTime(data!.checkedAt)}`
  return (
    <Badge variant="outline" className="mm-tabular" title={title} data-slot="bot-score-badge">
      <Gauge className="size-3" /> Bot score {value == null ? '—' : `${percentage(value)}%`}
    </Badge>
  )
}

export function BotScoreDetails({ data }: { data?: SerpBotScore | null }): React.JSX.Element {
  return (
    <section data-slot="bot-score-details" aria-label="SERP bot score" className="rounded-[16px] border border-[var(--hairline)] bg-white p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-[var(--steel)]"><Gauge className="size-3.5" /> SERP bot score</div>
          <div className="mm-tabular mt-1 text-[24px] font-semibold">{data?.value == null ? '—' : rawScore(data.value)} <span className="text-[13px] font-normal text-[var(--stone)]">/ 1</span></div>
        </div>
        <BotScoreBadge data={data} />
      </div>
      <p className="mt-1 text-[11.5px] leading-relaxed text-[var(--steel)]">
        {data?.value == null ? data?.error ?? 'Cập nhật trạng thái để đọc API getuserinfo.' : explanation}
      </p>
      {data ? <div className="mt-2 border-t border-[var(--hairline-soft)] pt-2 text-[11px] text-[var(--steel)]">
        <div>Nguồn cập nhật: {data.updatedAt ? dateTime(data.updatedAt) : 'Không có thời gian từ API'}</div>
        <div>Đã đọc: {dateTime(data.checkedAt)}</div>
      </div> : null}
    </section>
  )
}
