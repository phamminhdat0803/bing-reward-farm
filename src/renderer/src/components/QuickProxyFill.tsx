import { useId } from 'react'
import { Zap } from 'lucide-react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { parseProxyCount } from '@renderer/lib/proxy-quick-fill'

export function QuickProxyFill({ value, onValueChange, onFill }: {
  value: string
  onValueChange: (value: string) => void
  onFill: () => void
}): React.JSX.Element {
  const id = useId()
  const count = parseProxyCount(value)
  return (
    <div data-slot="quick-proxy-fill" className="flex items-center gap-1.5">
      <Label htmlFor={id} className="whitespace-nowrap text-[11.5px] text-[var(--steel)]">Số proxy</Label>
      <Input
        id={id}
        type="number"
        min={1}
        step={1}
        value={value}
        onChange={event => onValueChange(event.target.value)}
        aria-invalid={count === null}
        className="mm-tabular h-7 w-16 px-2 text-[12px]"
        title="Tổng số proxy: 1 proxy chính, số còn lại làm dự phòng"
      />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="h-7 gap-1 px-2.5 text-[11.5px]"
        disabled={count === null}
        onClick={onFill}
        title={count === null ? 'Nhập số nguyên từ 1 trở lên' : `Gán ${count} proxy: 1 chính${count > 1 ? ` + ${count - 1} dự phòng` : ''}. Ưu tiên đã test OK, ping thấp và chưa tài khoản khác dùng.`}
      >
        <Zap className="size-3" /> Gán nhanh
      </Button>
    </div>
  )
}
