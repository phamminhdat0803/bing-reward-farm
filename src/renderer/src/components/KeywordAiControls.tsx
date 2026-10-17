import { useEffect, useMemo, useState } from 'react'
import { Settings2, Sparkles, Square, ClipboardCopy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select'
import { emptyAiJob, type KeywordAiConfig, type KeywordAiJob } from '@shared/keyword-ai'
import { normalizeKeywords } from '@shared/keywords'

const initialConfig: KeywordAiConfig = { baseURL: 'https://api.openai.com/v1', apiMode: 'chat', model: '', hasKey: false, encryptionAvailable: false }

export function KeywordAiControls({ onUseDraft }: { onUseDraft: (text: string) => void }): React.JSX.Element {
  const [config, setConfig] = useState(initialConfig)
  const [form, setForm] = useState(initialConfig)
  const [apiKey, setApiKey] = useState('')
  const [clearKey, setClearKey] = useState(false)
  const [configOpen, setConfigOpen] = useState(false)
  const [generateOpen, setGenerateOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState<KeywordAiJob>(emptyAiJob)
  const [count, setCount] = useState('1500')
  const [batchSize, setBatchSize] = useState('100')
  const [language, setLanguage] = useState('English')
  const [topics, setTopics] = useState('')
  const [review, setReview] = useState('')
  const running = job.status === 'running'
  const preview = useMemo(() => {
    try { return { count: normalizeKeywords(review).length, error: '' } }
    catch (e) { return { count: 0, error: (e as Error).message } }
  }, [review])
  useEffect(() => {
    let active = true
    void Promise.all([window.api.getKeywordAiConfig(), window.api.getKeywordAiJob()]).then(([cfg, saved]) => {
      if (active) { setConfig(cfg); setForm(cfg); setJob(saved); setReview(saved.keywords.join('\n')) }
    }).catch(() => { if (active) toast.error('Không tải được cấu hình/bản nháp AI.') })
    return () => { active = false }
  }, [])
  useEffect(() => {
    if (!running) return
    let active = true, pending = false
    const timer = window.setInterval(() => {
      if (pending) return
      pending = true
      void window.api.getKeywordAiJob().then(next => {
        if (!active) return
        setJob(next); setReview(next.keywords.join('\n'))
      }).catch(() => { /* Giữ bản nháp hiện tại khi IPC tạm lỗi. */ }).finally(() => { pending = false })
    }, 1000)
    return () => { active = false; window.clearInterval(timer) }
  }, [running])
  const act = async (action: () => Promise<void>): Promise<void> => {
    setBusy(true)
    try { await action() } catch (e) { toast.error((e as Error).message) } finally { setBusy(false) }
  }
  const openSettings = (): void => { setForm(config); setApiKey(''); setClearKey(false); setConfigOpen(true) }
  const changed = form.baseURL !== config.baseURL || form.model !== config.model || form.apiMode !== config.apiMode || !!apiKey || clearKey
  const pct = Math.min(100, Math.round(job.keywords.length / Math.max(1, job.requested) * 100))
  return <>
    <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setGenerateOpen(true)}><Sparkles className="size-3.5" />{running ? `AI: ${job.keywords.length}/${job.requested}` : 'Tạo bằng AI'}</Button>
    <Button size="sm" variant="tertiary" className="gap-1.5" onClick={openSettings}><Settings2 className="size-3.5" /> Cấu hình AI</Button>

    <Dialog open={configOpen} onOpenChange={open => { if (!busy) { setConfigOpen(open); if (!open) setApiKey('') } }}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader><DialogTitle>Cấu hình AI · BYOK</DialogTitle><DialogDescription>Dùng API key và endpoint OpenAI hoặc nhà cung cấp tương thích của bạn.</DialogDescription></DialogHeader>
        <label className="grid gap-1 text-[12.5px] font-medium">Base URL<Input autoFocus aria-label="AI Base URL" placeholder="https://api.openai.com/v1" value={form.baseURL} disabled={busy || running} onChange={e => setForm({ ...form, baseURL: e.target.value })} /></label>
        <p className="text-[12px] text-[var(--steel)]">Nhập URL gốc gồm /v1 nếu nhà cung cấp yêu cầu. Không thêm /chat/completions hoặc /responses.</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-[12.5px] font-medium">Kiểu API<Select value={form.apiMode} disabled={busy || running} onValueChange={value => setForm({ ...form, apiMode: value as KeywordAiConfig['apiMode'] })}><SelectTrigger aria-label="Kiểu API AI"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="chat">Chat Completions</SelectItem><SelectItem value="responses">Responses</SelectItem></SelectContent></Select></label>
          <label className="grid gap-1 text-[12.5px] font-medium">Model<Input aria-label="AI model" placeholder="Tên model từ nhà cung cấp" value={form.model} disabled={busy || running} onChange={e => setForm({ ...form, model: e.target.value })} /></label>
        </div>
        <label className="grid gap-1 text-[12.5px] font-medium">API key<Input aria-label="AI API key" type="password" autoComplete="off" spellCheck={false} placeholder={config.hasKey ? 'Đã lưu key · để trống để giữ nguyên' : 'Nhập API key'} value={apiKey} disabled={busy || running || !config.encryptionAvailable} onChange={e => { setApiKey(e.target.value); setClearKey(false) }} /></label>
        <div className="flex items-center justify-between gap-2 text-[12px] text-[var(--steel)]"><span>{!config.encryptionAvailable ? 'Máy chưa hỗ trợ lưu key mã hoá.' : 'Key được lưu mã hoá trên máy, không trả lại giao diện.'}</span>{config.hasKey && <Button size="sm" variant="tertiary" disabled={busy || running} onClick={() => { setClearKey(!clearKey); setApiKey('') }}>{clearKey ? 'Giữ key' : 'Xoá key khi lưu'}</Button>}</div>
        {form.baseURL !== config.baseURL && config.hasKey && <p className="text-[12px] text-[var(--steel)]">Đổi endpoint cần nhập key cho endpoint mới hoặc chọn xoá key cũ.</p>}
        <p className="text-[12px] text-[var(--stone)]">Kiểm tra kết nối gửi một yêu cầu ngắn tới model đã lưu và có thể tính phí API.</p>
        <DialogFooter>
          <Button size="sm" variant="tertiary" disabled={busy} onClick={() => { setConfigOpen(false); setApiKey('') }}>Đóng</Button>
          <Button size="sm" variant="secondary" disabled={busy || running || changed || !config.hasKey} onClick={() => void act(async () => { const result = await window.api.testKeywordAi(); if (!result.ok) throw new Error(result.error); toast.success('Kết nối AI thành công.') })}>Kiểm tra kết nối</Button>
          <Button size="sm" disabled={busy || running} onClick={() => void act(async () => { const next = await window.api.saveKeywordAiConfig({ baseURL: form.baseURL, model: form.model, apiMode: form.apiMode, apiKey: apiKey || undefined, clearKey }); setConfig(next); setForm(next); setApiKey(''); setClearKey(false); toast.success('Đã lưu cấu hình AI.') })}>{busy ? 'Đang xử lý…' : 'Lưu cấu hình'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog open={generateOpen} onOpenChange={setGenerateOpen}>
      <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden sm:max-w-[720px]">
        <DialogHeader><DialogTitle>Tạo từ khoá bằng AI</DialogTitle><DialogDescription>{config.model ? `${config.model} · ${config.apiMode === 'chat' ? 'Chat Completions' : 'Responses'}` : 'Cấu hình endpoint, model và API key trước khi tạo.'}</DialogDescription></DialogHeader>
        <div className="grid grid-cols-3 gap-3">
          <label className="grid gap-1 text-[12.5px] font-medium">Số từ cần tạo<Input aria-label="AI số từ cần tạo" type="number" min={1} max={10000} value={count} disabled={running || busy} onChange={e => setCount(e.target.value)} /></label>
          <label className="grid gap-1 text-[12.5px] font-medium">Mỗi đợt<Input aria-label="AI số từ mỗi đợt" type="number" min={10} max={300} value={batchSize} disabled={running || busy} onChange={e => setBatchSize(e.target.value)} /></label>
          <label className="grid gap-1 text-[12.5px] font-medium">Ngôn ngữ<Input aria-label="AI ngôn ngữ" value={language} disabled={running || busy} onChange={e => setLanguage(e.target.value)} /></label>
        </div>
        <label className="grid gap-1 text-[12.5px] font-medium">Chủ đề<Input aria-label="AI chủ đề" placeholder="Science, cooking, history, travel…" value={topics} disabled={running || busy} onChange={e => setTopics(e.target.value)} /></label>
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={running || busy || !config.hasKey} onClick={() => void act(async () => { const next = await window.api.startKeywordAi({ count: Number(count), batchSize: Number(batchSize), language, topics }); setJob(next); setReview(next.keywords.join('\n')) })}><Sparkles className="size-3.5" /> Tạo danh sách mới</Button>
          {running && <Button size="sm" variant="secondary" disabled={busy} onClick={() => void act(async () => { setJob(await window.api.stopKeywordAi()) })}><Square className="size-3" /> Dừng</Button>}
          {!config.hasKey && <Button size="sm" variant="tertiary" onClick={() => { setGenerateOpen(false); openSettings() }}>Mở cấu hình AI</Button>}
          <span className="mm-tabular ml-auto text-[12px] text-[var(--steel)]">{job.keywords.length}/{job.requested} · {job.batches} đợt · {job.tokens.toLocaleString('vi-VN')} token</span>
        </div>
        <div className="h-1.5 shrink-0 overflow-hidden rounded-full bg-[var(--hairline)]"><div className="h-full bg-[var(--brand-blue-deep)] transition-[width]" style={{ width: `${pct}%` }} /></div>
        <p className="text-[12px] text-[var(--steel)]">{job.error || (running ? 'Đang tạo từng đợt. Có thể đóng hộp thoại hoặc đổi tab; bản nháp được giữ lại.' : job.status === 'completed' ? 'Đã tạo xong. Xem và chỉnh sửa trước khi nạp vào kho.' : job.status === 'stopped' ? 'Đã dừng. Có thể sử dụng phần đã tạo.' : 'Kết quả mới thay bản nháp AI cũ; danh sách trong kho chỉ đổi khi bạn nạp.')}</p>
        <textarea aria-label="Kết quả AI để xem sửa" className="h-56 min-h-[100px] w-full resize-none rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3 text-[12.5px] outline-none focus:border-[var(--ink)]" value={review} disabled={running} onChange={e => setReview(e.target.value)} placeholder="Kết quả AI sẽ xuất hiện tại đây, mỗi dòng một từ khoá." />
        <div className="flex items-center justify-between text-[12px] text-[var(--steel)]"><span>{preview.error || `${preview.count.toLocaleString('vi-VN')} từ hợp lệ trong bản xem sửa`}</span><span>{running ? 'Đang tạo…' : job.status === 'failed' ? 'Đã dừng do lỗi' : ''}</span></div>
        <DialogFooter><Button size="sm" variant="tertiary" onClick={() => setGenerateOpen(false)}>Đóng</Button><Button size="sm" variant="tertiary" disabled={!review || running} onClick={() => void navigator.clipboard.writeText(review).then(() => toast.success('Đã copy kết quả AI.')).catch(() => toast.error('Không copy được.'))}><ClipboardCopy className="size-3.5" /> Copy</Button><Button size="sm" disabled={running || !preview.count} onClick={() => { setGenerateOpen(false); onUseDraft(review) }}>Xem và nạp vào kho</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>
}
