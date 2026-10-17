import { KeywordAiControls } from './KeywordAiControls'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ChevronDown, ClipboardCopy, Download, FileText, Plus, RefreshCw, Search, Sparkles, X } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Badge } from './ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table'
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog'
import { keywordKey, keywordPrompt, normalizeKeywords, type KeywordLibrary } from '@shared/keywords'

export function KeywordsPanel(): React.JSX.Element {
  const [library, setLibrary] = useState<KeywordLibrary>({ version: 1, keywords: [], updatedAt: null })
  const [draft, setDraft] = useState('')
  const [count, setCount] = useState('1500')
  const [topics, setTopics] = useState('')
  const [search, setSearch] = useState('')
  const [usageFilter, setUsageFilter] = useState<'all' | 'available' | 'reserved' | 'used'>('all')
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [promptOpen, setPromptOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const reload = async (): Promise<void> => {
    try { setLibrary(await window.api.getKeywords()); setLoaded(true) }
    catch (e) { toast.error(String((e as Error).message)) }
  }
  useEffect(() => {
    void reload()
    const timer = window.setInterval(() => void reload(), 5000)
    return () => window.clearInterval(timer)
  }, [])
  const preview = useMemo(() => {
    try { return { count: normalizeKeywords(draft).length, error: '' } }
    catch (e) { return { count: 0, error: (e as Error).message } }
  }, [draft])
  const usage = useMemo(() => new Map((library.usage ?? []).map(entry => [keywordKey(entry.keyword), entry])), [library.usage])
  const usageCounts = useMemo(() => {
    let used = 0, reserved = 0
    for (const keyword of library.keywords) {
      const entry = usage.get(keywordKey(keyword))
      if (entry?.status === 'used') used++
      else if (entry?.status === 'reserved') reserved++
    }
    return { used, reserved, available: library.keywords.length - used - reserved }
  }, [library.keywords, usage])
  const filterLabels = { all: 'Tất cả', available: 'Chưa dùng', reserved: 'Đã giữ chỗ', used: 'Đã sử dụng' }
  const filtered = useMemo(() => library.keywords.filter(keyword => {
    const entry = usage.get(keywordKey(keyword))
    return keyword.toLowerCase().includes(search.trim().toLowerCase()) && (usageFilter === 'all' || (entry?.status ?? 'available') === usageFilter)
  }), [library.keywords, search, usage, usageFilter])
  const pages = Math.max(1, Math.ceil(filtered.length / 100))
  const current = Math.min(page, pages - 1)
  const save = async (mode: 'append' | 'replace'): Promise<void> => {
    setBusy(true)
    try {
      const next = await window.api.saveKeywords(draft, mode)
      setLibrary(next); setDraft(''); setPage(0); setImportOpen(false)
      toast.success(`Đã lưu ${next.keywords.length.toLocaleString('vi-VN')} từ khoá. Áp dụng từ lượt chạy kế tiếp.`)
    } catch (e) { toast.error((e as Error).message) }
    finally { setBusy(false) }
  }
  return <section data-slot="keywords-panel" className="flex min-h-0 flex-1 flex-col">
    <div data-slot="keywords-toolbar" className="flex h-12 shrink-0 items-center gap-1.5 overflow-x-auto border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 [&>button]:shrink-0">
      <Button size="sm" className="gap-1.5" onClick={() => setImportOpen(true)}><Plus className="size-3.5" /> Nạp từ khoá</Button>
      <KeywordAiControls onUseDraft={text => { setDraft(text); setImportOpen(true) }} />
      <Button size="sm" variant="tertiary" className="gap-1.5" onClick={() => setPromptOpen(true)}><Sparkles className="size-3.5" /> Tạo prompt AI</Button>
      <span className="mx-1 h-5 w-px shrink-0 bg-[var(--hairline)]" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="tertiary" className="gap-1.5"><Download className="size-3.5" /> Xuất dữ liệu <ChevronDown className="size-3" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <DropdownMenuItem className="gap-2" disabled={!library.keywords.length} onClick={() => void navigator.clipboard.writeText(library.keywords.join('\n')).then(() => toast.success('Đã copy danh sách.')).catch(() => toast.error('Không copy được.'))}><ClipboardCopy className="size-3.5" /> Copy danh sách</DropdownMenuItem>
          <DropdownMenuItem className="gap-2" disabled={!library.keywords.length} onClick={() => {
            void window.api.exportSave({ name: 'keywords.txt', content: library.keywords.join('\n'), ext: 'txt' }).then(r => { if (r.ok) toast.success('Đã xuất TXT.'); else if (!r.canceled) toast.error(r.error) }).catch(e => toast.error(e.message))
          }}><FileText className="size-3.5" /> Xuất TXT</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="tertiary" className="gap-1.5" onClick={() => void reload()}><RefreshCw className="size-3.5" /> Làm mới</Button>
      <span className="mm-tabular ml-auto shrink-0 pl-3 text-[12px] text-[var(--steel)]" title={library.updatedAt ? new Date(library.updatedAt).toLocaleString('vi-VN') : undefined}>
        {library.updatedAt ? `Nạp lúc ${new Date(library.updatedAt).toLocaleString('vi-VN')}` : 'Đang dùng nguồn mặc định'}
      </span>
    </div>
    <div data-slot="keywords-filters" className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--hairline-soft)] px-3">
      <div className="relative w-[280px] shrink-0">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--stone)]" />
        <Input className="h-8 pl-8 pr-8 text-[12.5px]" aria-label="Tìm từ khoá" placeholder="Tìm trong danh sách…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} />
        {search && <button type="button" aria-label="Xoá tìm kiếm" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--stone)] hover:text-[var(--ink)]" onClick={() => { setSearch(''); setPage(0) }}><X className="size-3.5" /></button>}
      </div>
      <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="tertiary" className="gap-1.5">Trạng thái: {filterLabels[usageFilter]}<ChevronDown className="size-3" /></Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-[200px]">{(['all', 'available', 'reserved', 'used'] as const).map(filter => <DropdownMenuItem key={filter} onClick={() => { setUsageFilter(filter); setPage(0) }}>{filterLabels[filter]} ({filter === 'all' ? library.keywords.length : usageCounts[filter]})</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
      <span className="mm-tabular ml-auto whitespace-nowrap text-[12.5px] text-[var(--stone)]">{filtered.length.toLocaleString('vi-VN')}{search.trim() ? `/${library.keywords.length.toLocaleString('vi-VN')}` : ''} từ khoá</span>
    </div>
    <div data-slot="keywords-table" className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
      <Table horizontalScroll={false} className="table-fixed">
        <colgroup>{[6, 44, 14, 20, 16].map(width => <col key={width} style={{ width: `${width}%` }} />)}</colgroup>
        <TableHeader><TableRow><TableHead className="text-center">STT</TableHead><TableHead>Từ khoá</TableHead><TableHead>Trạng thái</TableHead><TableHead>Tài khoản / loại search</TableHead><TableHead>Thời gian</TableHead></TableRow></TableHeader>
        <TableBody>{filtered.slice(current * 100, (current + 1) * 100).map((keyword, i) => {
          const entry = usage.get(keywordKey(keyword))
          return <TableRow key={keyword} className="h-10"><TableCell className="mm-tabular text-center text-[var(--stone)]">{current * 100 + i + 1}</TableCell><TableCell className="truncate text-[12.5px]" title={keyword}>{keyword}</TableCell>
            <TableCell><Badge variant={entry?.status === 'used' ? 'success' : entry ? 'warning' : 'secondary'} title={entry?.status === 'reserved' ? 'Đã giữ trước khi gửi search; có thể đang chạy hoặc chưa xác nhận kết quả. Không cấp lại cho trình duyệt khác.' : undefined}>{entry?.status === 'used' ? 'Đã sử dụng' : entry ? 'Đã giữ chỗ' : 'Chưa dùng'}</Badge></TableCell>
            <TableCell className="truncate text-[12px] text-[var(--steel)]" title={entry ? `${entry.profileName} · ${entry.kind}` : undefined}>{entry ? `${entry.profileName} · ${entry.kind === 'history' ? 'Lịch sử cũ' : entry.kind === 'desktop' ? 'Desktop' : 'Mobile'}` : '—'}</TableCell>
            <TableCell className="mm-tabular truncate text-[12px] text-[var(--steel)]" title={entry?.at}>{entry?.at ? new Date(entry.at).toLocaleString('vi-VN') : '—'}</TableCell>
          </TableRow>
        })}
          {!filtered.length && <TableRow><TableCell colSpan={5} className="py-12 text-center text-[var(--steel)]">{search.trim() || usageFilter !== 'all' ? 'Không có từ khoá nào khớp với tìm kiếm.' : 'Chưa có từ khoá — bấm “Nạp từ khoá” để dán danh sách hoặc nhập file TXT.'}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
    <div data-slot="keywords-footer" className="mm-tabular flex h-9 shrink-0 items-center justify-between gap-4 overflow-hidden whitespace-nowrap border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 text-[12px] text-[var(--steel)]">
      <span>{usageCounts.available.toLocaleString('vi-VN')} chưa dùng · {usageCounts.used.toLocaleString('vi-VN')} đã dùng · {usageCounts.reserved.toLocaleString('vi-VN')} giữ chỗ</span>
      <div className="flex items-center gap-2"><span>Trang {current + 1}/{pages} · 100 dòng/trang</span><Button size="sm" variant="tertiary" className="h-6 px-2.5 text-[11.5px]" disabled={current === 0} onClick={() => setPage(current - 1)}>Trước</Button><Button size="sm" variant="tertiary" className="h-6 px-2.5 text-[11.5px]" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>Sau</Button></div>
    </div>

    <Dialog open={promptOpen} onOpenChange={setPromptOpen}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader><DialogTitle>Tạo prompt AI</DialogTitle><DialogDescription>Tạo danh sách tìm kiếm tiếng Anh theo chủ đề bạn quan tâm.</DialogDescription></DialogHeader>
        <div className="grid grid-cols-[120px_1fr] gap-3 py-1">
          <label className="grid gap-1 text-[12.5px] font-medium">Số lượng<Input autoFocus aria-label="Số từ khoá cần tạo" type="number" min={1} max={100000} value={count} onChange={e => setCount(e.target.value)} /></label>
          <label className="grid gap-1 text-[12.5px] font-medium">Chủ đề quan tâm<Input aria-label="Chủ đề từ khoá" placeholder="Science, cooking, technology…" value={topics} onChange={e => setTopics(e.target.value)} /></label>
        </div>
        <p className="text-[12.5px] text-[var(--steel)]">Prompt yêu cầu từ khoá có ý nghĩa, đa dạng và không lặp. Nếu AI chia kết quả thành nhiều phần, bạn có thể nạp thêm từng phần.</p>
        <DialogFooter><Button size="sm" variant="tertiary" onClick={() => setPromptOpen(false)}>Đóng</Button><Button size="sm" className="gap-1.5" onClick={() => {
          try { void navigator.clipboard.writeText(keywordPrompt(Number(count), topics)).then(() => toast.success('Đã copy prompt.')).catch(() => toast.error('Không copy được.')) }
          catch (e) { toast.error((e as Error).message) }
        }}><ClipboardCopy className="size-3.5" /> Copy prompt</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <Dialog open={importOpen} onOpenChange={open => { if (!busy) setImportOpen(open) }}>
      <DialogContent className="flex max-h-[86vh] flex-col overflow-hidden sm:max-w-[640px]">
        <DialogHeader><DialogTitle>Nạp từ khoá</DialogTitle><DialogDescription>Mỗi dòng một từ khoá. Tự loại trùng; tối đa 100.000 từ trong kho.</DialogDescription></DialogHeader>
        <textarea autoFocus aria-label="Danh sách từ khoá mới" className="min-h-0 h-56 w-full resize-none rounded-xl border border-[var(--hairline)] bg-[var(--canvas)] p-3 text-[12.5px] outline-none focus:border-[var(--ink)]" placeholder="Dán danh sách tại đây hoặc chọn file TXT…" value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} />
        <input ref={fileInput} className="hidden" type="file" accept=".txt,text/plain" onChange={e => {
          const file = e.target.files?.[0]; e.target.value = ''
          if (file) {
            if (file.size > 20_000_000) { toast.error('File tối đa 20 MB.'); return }
            void file.text().then(setDraft).catch(() => toast.error('Không đọc được file.'))
          }
        }} />
        <div className="flex items-center justify-between gap-2"><Button size="sm" variant="tertiary" className="gap-1.5" disabled={busy} onClick={() => fileInput.current?.click()}><FileText className="size-3.5" /> Chọn file TXT</Button><span className="mm-tabular text-[12px] text-[var(--steel)]">{preview.error || `${preview.count.toLocaleString('vi-VN')} từ hợp lệ, không trùng`}</span></div>
        <p className="text-[12px] text-[var(--steel)]">Kho dùng chung cho desktop và mobile. Từ đã dùng hoặc giữ chỗ được chặn dùng lại trên mọi trình duyệt, kể cả khi nạp danh sách mới hay sang ngày khác.</p>
        <DialogFooter><Button size="sm" variant="tertiary" disabled={busy} onClick={() => setImportOpen(false)}>Đóng</Button><Button size="sm" variant="secondary" disabled={!loaded || busy || !preview.count} onClick={() => {
          setImportOpen(false)
          setConfirm({ title: 'Thay toàn bộ danh sách từ khoá?', description: `Thay ${library.keywords.length} từ đang lưu bằng ${preview.count} từ mới. Sổ từ đã dùng chung vẫn được giữ; từ đã dùng không được cấp lại.`, confirmLabel: 'Thay toàn bộ', onConfirm: () => save('replace') })
        }}>Thay toàn bộ</Button><Button size="sm" disabled={!loaded || busy || !preview.count} onClick={() => void save('append')}>{busy ? 'Đang lưu…' : 'Nạp thêm'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    <ConfirmDialog request={confirm} onClose={() => setConfirm(null)} />
  </section>
}
