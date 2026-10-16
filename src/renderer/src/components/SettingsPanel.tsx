import { useEffect, useId, useState } from 'react'
import { CalendarClock, Check, Clock3, Gauge, Loader2, Save, Search, ShieldCheck, SlidersHorizontal, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { DEFAULT_ACCOUNT_POLICY, POLICY_PRESETS, type AccountPolicy, type AutomationPolicy, type PolicyPlan } from '@shared/policy'
import type { RowState } from '@shared/types'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { ScrollArea } from './ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group'

const statusNames = { legacy: 'Chưa bật', ready: 'Sẵn sàng', waiting: 'Đang chờ', paused: 'Tạm dừng', 'goal-met': 'Đạt mục tiêu' }
const weekdays = [
  { short: 'CN', label: 'Chủ nhật' }, { short: 'T2', label: 'Thứ 2' },
  { short: 'T3', label: 'Thứ 3' }, { short: 'T4', label: 'Thứ 4' },
  { short: 'T5', label: 'Thứ 5' }, { short: 'T6', label: 'Thứ 6' }, { short: 'T7', label: 'Thứ 7' }
]

function NumberField({ label, value, onChange, min = 0, max = 200, hint }: {
  label: string; value: number; onChange: (value: number) => void; min?: number; max?: number; hint?: string
}): React.JSX.Element {
  const id = useId()
  return <div className="grid content-start gap-1.5">
    <Label htmlFor={id} className="text-[12px]">{label}</Label>
    <Input id={id} type="number" min={min} max={max} step={1} value={Number.isFinite(value) ? value : ''} onChange={e => onChange(e.target.value === '' ? NaN : Number(e.target.value))} className="mm-tabular" />
    {hint ? <p className="mm-micro leading-relaxed">{hint}</p> : null}
  </div>
}
function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }): React.JSX.Element {
  return <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[10px] border border-[var(--hairline-soft)] px-3 py-2">
    <span><span className="block text-[12.5px] font-medium">{label}</span>{hint ? <span className="mm-micro mt-0.5 block leading-relaxed">{hint}</span> : null}</span>
    <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
  </label>
}
function Section({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }): React.JSX.Element {
  return <section className="rounded-[16px] border border-[var(--hairline)] bg-white p-4">
    <div className="mb-4 flex items-start gap-2.5">
      <span className="mt-0.5 text-[var(--steel)]">{icon}</span>
      <div><h3 className="text-[14px] font-semibold">{title}</h3><p className="mm-micro mt-1 leading-relaxed">{subtitle}</p></div>
    </div>
    {children}
  </section>
}

export function SettingsPanel({ rows, onSaved }: { rows: RowState[]; onSaved: () => void }): React.JSX.Element {
  const [config, setConfig] = useState<AutomationPolicy | null>(null)
  const [scope, setScope] = useState('default')
  const [plans, setPlans] = useState<PolicyPlan[]>([])
  const [every, setEvery] = useState(0)
  const [savedEvery, setSavedEvery] = useState(0)
  const [busy, setBusy] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void Promise.all([window.api.getAutomationPolicy(), window.api.getSettings(), window.api.previewAutomationPolicy()])
      .then(([policy, settings, preview]) => {
        if (!active) return
        setConfig(policy); setPlans(preview); setEvery(settings.autoEveryMs ?? 0); setSavedEvery(settings.autoEveryMs ?? 0)
      }).catch(e => { if (active) setError(String(e.message ?? e)) })
    return () => { active = false }
  }, [])
  if (!config) return <div className="flex flex-1 items-center justify-center p-5 text-[13px] text-[var(--steel)]">{error || <><Loader2 className="mr-2 size-4 animate-spin" /> Đang tải cài đặt…</>}</div>
  const own = scope !== 'default' && Object.hasOwn(config.overrides, scope)
  const rule = own ? config.overrides[scope] : config.defaults
  const editable = scope === 'default' || own
  const update = (patch: Partial<AccountPolicy>): void => {
    setConfig(previous => previous ? scope === 'default'
      ? { ...previous, defaults: { ...previous.defaults, ...patch } }
      : { ...previous, overrides: { ...previous.overrides, [scope]: { ...rule, ...patch } } } : previous)
    setDirty(true)
  }
  const updateBot = (patch: Partial<AccountPolicy['botRule']>): void => update({ botRule: { ...rule.botRule, ...patch } })
  const preview = async (): Promise<void> => {
    setPreviewing(true)
    try { setPlans(await window.api.previewAutomationPolicy(config)); toast.info('Đã tính bản xem trước từ cache, không mở trình duyệt.') }
    catch (e) { toast.error(String((e as Error).message)) }
    finally { setPreviewing(false) }
  }
  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.api.saveAutomationPolicy(config)
      if (every !== savedEvery) await window.api.autoSetEvery(every)
      setConfig(next); setSavedEvery(every); setDirty(false)
      setPlans(await window.api.previewAutomationPolicy(next))
      onSaved()
      toast.success('Đã lưu cài đặt kịch bản.', { description: every ? 'Lịch tự động sẽ kiểm tra điều kiện trước khi chạy.' : 'Lịch tự động đang tắt; các giới hạn vẫn áp dụng khi bấm Chạy.' })
    } catch (e) { toast.error(`Chưa lưu đầy đủ cài đặt: ${String((e as Error).message)}`) }
    finally { setBusy(false) }
  }
  return <div className="flex min-h-0 flex-1 flex-col" data-slot="policy-settings">
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--hairline-soft)] px-5 py-3">
      <div><h1 className="text-[20px] font-semibold">Cài đặt kịch bản</h1><p className="mm-caption mt-1">Đặt mục tiêu, lịch và điều kiện dừng cho từng tài khoản.</p></div>
      <div className="flex items-center gap-2"><Badge variant={config.enabled ? 'success' : 'secondary'}>{config.enabled ? 'Quy tắc đang bật' : 'Quy tắc đang tắt'}</Badge><Switch aria-label="Bật bộ quy tắc" checked={config.enabled} onCheckedChange={enabled => { setConfig({ ...config, enabled }); setDirty(true) }} /></div>
    </div>
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto max-w-[1180px] space-y-4 p-4">
        <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="space-y-3">
            <section className="rounded-[16px] border border-[var(--hairline)] bg-white p-3">
              <Label htmlFor="policy-scope" className="mb-2 text-[12px]">Đang chỉnh cho</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="policy-scope"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Mặc định chung</SelectItem>
                  {rows.map(row => <SelectItem key={row.id} value={row.id}>{row.profile.name}{Object.hasOwn(config.overrides, row.id) ? ' · riêng' : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              {scope !== 'default' ? <div className="mt-2"><Toggle label="Dùng cấu hình riêng" checked={own} onChange={value => {
                const overrides = { ...config.overrides }
                if (value) overrides[scope] = structuredClone(config.defaults)
                else delete overrides[scope]
                setConfig({ ...config, overrides }); setDirty(true)
              }} /></div> : <p className="mm-micro mt-2 leading-relaxed">Áp dụng cho tài khoản chưa có cấu hình riêng.</p>}
              {!editable ? <p className="mm-micro mt-2 leading-relaxed">Đang dùng mặc định chung. Bật “Dùng cấu hình riêng” để chỉnh tài khoản này.</p> : null}
            </section>
            <section className="rounded-[16px] border border-[var(--hairline)] bg-white p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[12.5px] font-semibold"><Sparkles className="size-3.5" /> Mẫu kịch bản</div>
              <div className="space-y-1.5">{POLICY_PRESETS.map(preset => <button key={preset.id} type="button" data-preset={preset.id} disabled={!editable} className="w-full rounded-[10px] border border-[var(--hairline-soft)] p-2.5 text-left transition-colors hover:bg-[var(--surface)] disabled:opacity-40" onClick={() => update({ ...structuredClone(DEFAULT_ACCOUNT_POLICY), ...structuredClone(preset.patch) })}>
                <span className="block text-[12.5px] font-semibold">{preset.label}</span><span className="mm-micro mt-1 block leading-relaxed">{preset.description}</span>
              </button>)}</div>
              <p className="mm-micro mt-2 leading-relaxed">Chọn mẫu sẽ thay toàn bộ quy tắc của phạm vi đang chỉnh. Chỉ có hiệu lực sau khi Lưu.</p>
            </section>
          </aside>
          <fieldset disabled={!editable} className="min-w-0 space-y-4 disabled:opacity-60">
            <Section title="Ngân sách tìm kiếm" subtitle="Tổng lượt tính cả desktop và mobile; mỗi lần gửi search đều được tính, kể cả chưa được cộng điểm." icon={<Search className="size-4" />}>
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(['limited', 'monitor'] as const).map(mode => <Button key={mode} variant={rule.mode === mode ? 'default' : 'tertiary'} onClick={() => update({ mode })}>{mode === 'limited' ? 'Chạy có giới hạn' : 'Chỉ theo dõi'}</Button>)}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Mục tiêu điểm tìm kiếm (%)" value={rule.targetPercent} min={0} max={100} onChange={targetPercent => update({ targetPercent })} hint="Tính theo hạn mức thực tế; làm tròn xuống theo 3 điểm/lượt." />
                <NumberField label="Tổng lượt tìm kiếm / ngày" value={rule.maxSearchesPerDay} onChange={maxSearchesPerDay => update({ maxSearchesPerDay })} hint="0 = không search. Giữ ngân sách khi đóng/mở lại app." />
                <NumberField label="Số phiên tối đa / ngày" value={rule.maxSessionsPerDay} min={1} max={24} onChange={maxSessionsPerDay => update({ maxSessionsPerDay })} />
                <NumberField label="Số lượt tối đa / phiên" value={rule.maxSearchesPerSession} min={1} max={100} onChange={maxSearchesPerSession => update({ maxSearchesPerSession })} />
              </div>
            </Section>
            <Section title="Lịch hoạt động" subtitle="Dùng giờ trên máy. Ngoài lịch thì chờ; mỗi phiên chỉ bắt đầu khi đủ khoảng cách." icon={<CalendarClock className="size-4" />}>
              <div className="grid grid-cols-3 gap-3">
                <div className="grid gap-1.5"><Label htmlFor="policy-start" className="text-[12px]">Từ giờ</Label><Input id="policy-start" type="time" value={rule.startTime} onChange={e => update({ startTime: e.target.value })} /></div>
                <div className="grid gap-1.5"><Label htmlFor="policy-end" className="text-[12px]">Đến giờ</Label><Input id="policy-end" type="time" value={rule.endTime} onChange={e => update({ endTime: e.target.value })} /></div>
                <NumberField label="Cách phiên (phút)" value={rule.sessionGapMinutes} max={1440} onChange={sessionGapMinutes => update({ sessionGapMinutes })} />
              </div>
              <div className="mt-4 space-y-2">
                <Label id="policy-weekdays-label" className="text-[12px]">Ngày trong tuần</Label>
                <ToggleGroup type="multiple" aria-labelledby="policy-weekdays-label" aria-describedby="policy-weekdays-summary" disabled={!editable} value={rule.weekdays.map(String)} onValueChange={values => {
                  if (!values.length) { toast.info('Cần chọn ít nhất một ngày trong tuần.'); return }
                  update({ weekdays: values.map(Number).sort((a, b) => a - b) })
                }} className="grid grid-cols-7">
                  {weekdays.map((day, i) => <ToggleGroupItem key={day.short} value={String(i)} aria-label={day.label} title={day.label} className="px-1">
                    <Check aria-hidden="true" className={`size-3 transition-opacity motion-reduce:transition-none ${rule.weekdays.includes(i) ? 'opacity-100' : 'opacity-0'}`} />{day.short}
                  </ToggleGroupItem>)}
                </ToggleGroup>
                <p id="policy-weekdays-summary" aria-live="polite" className="mm-micro min-h-[18px] leading-relaxed">{rule.weekdays.length === 7 ? 'Đã chọn cả tuần' : `Đã chọn: ${weekdays.filter((_, i) => rule.weekdays.includes(i)).map(day => day.short).join(', ')}`}. Bấm ngày để chọn hoặc bỏ chọn.</p>
              </div>
              <p className="mm-micro mt-2">Hai giờ giống nhau = cả ngày. Hỗ trợ khung giờ qua nửa đêm.</p>
              <div className="mt-3 grid gap-1.5"><Label htmlFor="policy-pause" className="text-[12px]">Tạm dừng tài khoản đến (tuỳ chọn)</Label><Input id="policy-pause" type="datetime-local" value={rule.pauseUntil ? new Date(new Date(rule.pauseUntil).getTime() - new Date(rule.pauseUntil).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''} onChange={e => update({ pauseUntil: e.target.value ? new Date(e.target.value).toISOString() : null })} /></div>
            </Section>
            <Section title="Quy tắc theo Bot score" subtitle="Score × 100 là % trên thang chỉ số API; các mức dưới đây do bạn chọn, không bảo đảm giảm score." icon={<Gauge className="size-4" />}>
              <Toggle label="Áp dụng quy tắc Bot score" checked={rule.botRule.enabled} onChange={enabled => updateBot({ enabled })} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberField label="Khi score từ (%)" value={rule.botRule.threshold} min={0} max={100} onChange={threshold => updateBot({ threshold })} />
                <div className="grid content-start gap-1.5"><Label htmlFor="policy-bot-action" className="text-[12px]">Thực hiện</Label><Select disabled={!editable} value={rule.botRule.action} onValueChange={value => updateBot({ action: value as 'pause' | 'reduce' })}><SelectTrigger id="policy-bot-action"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reduce">Giảm mục tiêu search</SelectItem><SelectItem value="pause">Tạm dừng toàn bộ nhiệm vụ</SelectItem></SelectContent></Select></div>
                <NumberField label="Mục tiêu khi score cao (%)" value={rule.botRule.targetPercent} min={0} max={100} onChange={targetPercent => updateBot({ targetPercent })} />
                <NumberField label="Tuổi dữ liệu tối đa (ngày)" value={rule.botRule.maxAgeDays} min={1} max={365} onChange={maxAgeDays => updateBot({ maxAgeDays })} hint="Tính theo thời gian nguồn API, không phải lần vừa đọc." />
                <div className="col-span-2 grid gap-1.5"><Label htmlFor="policy-bot-unknown" className="text-[12px]">Khi score thiếu, lỗi hoặc quá cũ</Label><Select disabled={!editable} value={rule.botRule.unknown} onValueChange={value => updateBot({ unknown: value as 'pause' | 'base' })}><SelectTrigger id="policy-bot-unknown"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pause">Tạm dừng để kiểm tra</SelectItem><SelectItem value="base">Dùng mục tiêu cơ bản</SelectItem></SelectContent></Select></div>
              </div>
            </Section>
            <Section title="Điều kiện dừng & khôi phục" subtitle="Yêu cầu xác minh hoặc giới hạn trên trang luôn dừng để người dùng xử lý; không tự vượt xác minh." icon={<ShieldCheck className="size-4" />}>
              <Toggle label="Nghỉ khi chưa thấy điểm tăng" hint="Điểm có thể cập nhật trễ; không chạy bù liên tục." checked={rule.stopOnNoCredit} onChange={stopOnNoCredit => update({ stopOnNoCredit })} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <NumberField label="Thời gian nghỉ sau lỗi (phút)" value={rule.cooldownMinutes} min={1} max={1440} onChange={cooldownMinutes => update({ cooldownMinutes })} />
                <NumberField label="Số lỗi tối đa / ngày" value={rule.maxFailuresPerDay} min={1} max={20} onChange={maxFailuresPerDay => update({ maxFailuresPerDay })} />
                <div className="grid content-start gap-1.5"><Label htmlFor="policy-proxy" className="text-[12px]">Khi toàn bộ proxy lỗi</Label><Select disabled={!editable} value={rule.proxyRecovery} onValueChange={value => update({ proxyRecovery: value as 'pause' | 'repair' })}><SelectTrigger id="policy-proxy"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pause">Dừng và chờ kiểm tra</SelectItem><SelectItem value="repair">Kiểm tra kho & gán lại</SelectItem></SelectContent></Select></div>
                <NumberField label="Số proxy khi tự gán lại" value={rule.proxyCount} min={1} max={20} onChange={proxyCount => update({ proxyCount })} />
              </div>
            </Section>
            <Section title="Nhiệm vụ được phép" subtitle="Chỉ chạy khi còn mục tiêu phù hợp. Thẻ khoá cấp độ và tài khoản không có mobile sẽ được bỏ qua." icon={<SlidersHorizontal className="size-4" />}>
              <div className="grid grid-cols-2 gap-2">{(['desktop', 'mobile', 'daily', 'earn'] as const).map(kind => <Toggle key={kind} label={{ desktop: 'Search desktop', mobile: 'Search mobile', daily: 'Daily set', earn: 'Keep earning' }[kind]} checked={rule.tasks[kind]} onChange={value => update({ tasks: { ...rule.tasks, [kind]: value } })} />)}</div>
            </Section>
          </fieldset>
        </div>
        <Section title="Lịch kiểm tra tự động của ứng dụng" subtitle="Lịch chỉ kiểm tra điều kiện; khung giờ, khoảng cách phiên và ngân sách vẫn được áp dụng. Tắt lịch vẫn giữ giới hạn khi bạn bấm Chạy." icon={<Clock3 className="size-4" />}>
          <div className="flex items-center justify-between gap-4"><Label htmlFor="policy-every" className="text-[12.5px]">Chu kỳ kiểm tra</Label><Select value={String(every)} onValueChange={value => { setEvery(Number(value)); setDirty(true) }}><SelectTrigger id="policy-every" aria-label="Chu kỳ kiểm tra tự động" className="max-w-[220px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="0">Tắt lịch tự động</SelectItem><SelectItem value="60000">Mỗi 1 phút</SelectItem><SelectItem value="900000">Mỗi 15 phút</SelectItem><SelectItem value="3600000">Mỗi 1 giờ</SelectItem><SelectItem value="10800000">Mỗi 3 giờ</SelectItem></SelectContent></Select></div>
        </Section>
        <section className="overflow-hidden rounded-[16px] border border-[var(--hairline)] bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline-soft)] p-4"><div><h3 className="text-[14px] font-semibold">Dự kiến cho từng tài khoản</h3><p className="mm-micro mt-1">Nhấn Xem trước sau khi chỉnh. Không mở trình duyệt, không gửi search.</p></div><Button variant="tertiary" size="sm" disabled={previewing} onClick={() => void preview()}>{previewing ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}Xem trước</Button></div>
          <table className="w-full table-fixed text-[12px]"><colgroup><col style={{ width: '22%' }} /><col style={{ width: '18%' }} /><col style={{ width: '18%' }} /><col style={{ width: '42%' }} /></colgroup><thead className="bg-[var(--surface)] text-left text-[var(--steel)]"><tr>{['Tài khoản', 'Mục tiêu search', 'Đã dùng hôm nay', 'Quyết định'].map(label => <th key={label} className="px-3 py-2 font-semibold">{label}</th>)}</tr></thead><tbody>{plans.map(plan => <tr key={plan.profileId} className="border-t border-[var(--hairline-soft)] align-top">
            <td className="px-3 py-3"><div className="truncate font-semibold" title={plan.name}>{plan.name}</div><div className="mm-micro mt-1">{Object.hasOwn(config.overrides, plan.profileId) ? 'Cấu hình riêng' : 'Mặc định chung'}</div></td>
            <td className="mm-tabular px-3 py-3">{plan.active ? <><strong>{plan.effectivePercent}%</strong><div className="mm-micro mt-1">PC {plan.desktopTarget}đ · Mobile {plan.mobileTarget}đ</div></> : 'Theo cài đặt hiện tại'}</td>
            <td className="mm-tabular px-3 py-3">{plan.usage.searches} lượt · {plan.usage.sessions} phiên<div className="mm-micro mt-1">Còn {plan.remainingToday} lượt ngân sách</div></td>
            <td className="px-3 py-3"><Badge variant={plan.status === 'ready' ? 'success' : plan.status === 'paused' ? 'warning' : 'secondary'}>{statusNames[plan.status]}</Badge><p className="mt-1.5 break-words leading-relaxed text-[var(--steel)]">{plan.reason}</p>{plan.tasks.length ? <div className="mm-micro mt-1">{plan.tasks.join(' · ')}</div> : null}{plan.usage.blockedUntil || plan.usage.failures ? <Button size="sm" variant="tertiary" className="mt-2 h-6 text-[11px]" onClick={() => { void window.api.resumeAutomationPolicy(plan.profileId).then(() => window.api.previewAutomationPolicy(config)).then(setPlans).then(() => toast.info('Đã gỡ chờ lỗi; giữ nguyên số lượt và số phiên đã dùng.')).catch(e => toast.error(String(e.message))) }}>Đã kiểm tra, gỡ chờ lỗi</Button> : null}</td>
          </tr>)}</tbody></table>
        </section>
      </div>
    </ScrollArea>
    <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[var(--hairline)] bg-white px-5 py-3">
      <span className="text-[12px] text-[var(--steel)]">{dirty ? 'Có thay đổi chưa lưu' : <span className="flex items-center gap-1"><Check className="size-3.5" /> Cài đặt đã lưu</span>}</span>
      <Button disabled={busy || !dirty} onClick={() => void save()} className="gap-1.5">{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Lưu cài đặt</Button>
    </div>
  </div>
}
