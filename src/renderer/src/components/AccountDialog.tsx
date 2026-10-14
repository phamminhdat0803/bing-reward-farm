import { useEffect, useRef, useState  } from 'react'
import { ChevronDown, ChevronUp, Plus, Wifi, X } from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'
import { Input } from '@renderer/components/ui/input'
import { Label } from '@renderer/components/ui/label'
import { Switch } from '@renderer/components/ui/switch'
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { ProxyPickerDialog } from '@renderer/components/ProxyPickerDialog'
import { Check } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import type { DetectedBrowser, Profile, ProxyItem, ProxyTestResult, RowState } from '@shared/types'

const FALLBACK: DetectedBrowser[] = [
  { id: 'msedge', name: 'Microsoft Edge', exe: '', version: null, chromium: true, autoSignInRisk: true },
  { id: 'chrome', name: 'Google Chrome', exe: '', version: null, chromium: true, autoSignInRisk: false }
]

/** Lan chuot o bat ky dau trong modal cung cuon than dialog (khong phai tro dung vao vung cuon). */
function useWheelToScroll(): {
  ref: React.RefObject<HTMLDivElement | null>
  onWheel: (e: React.WheelEvent) => void
} {
  const ref = useRef<HTMLDivElement>(null)
  const onWheel = (e: React.WheelEvent): void => {
    const vp = ref.current?.querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement | null
    if (!vp) return
    const canScroll = vp.scrollHeight > vp.clientHeight + 1
    if (!canScroll) return
    vp.scrollTop += e.deltaY
  }
  return { ref, onWheel }
}

export function AccountDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  rows = []
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: Profile | null
  onSubmit: (patch: Partial<Profile>) => Promise<void>
  /** để hộp chọn proxy biết proxy nào đang gắn cho tài khoản nào */
  rows?: RowState[]
}): React.JSX.Element {
  const { ref: areaRef, onWheel } = useWheelToScroll()
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [profileDir, setProfileDir] = useState('')
  const [cdpPort, setCdpPort] = useState('')
  const [note, setNote] = useState('')
  const [channel, setChannel] = useState('msedge')
  const [proxyId, setProxyId] = useState('')
  const [proxyList, setProxyList] = useState<ProxyItem[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerMode, setPickerMode] = useState<'main' | 'fallback'>('main')
  /** Proxy du phong theo thu tu (sau proxy chinh) */
  const [proxyFallbacks, setProxyFallbacks] = useState<string[]>([])
  const [testingProxy, setTestingProxy] = useState(false)
  const [proxyResult, setProxyResult] = useState<ProxyTestResult | null>(null)
  const [browsers, setBrowsers] = useState<DetectedBrowser[]>([])
  const [capPreset, setCapPreset] = useState<'auto' | 'taiwan' | 'level1' | 'level2' | 'custom'>('auto')
  const [customDesktopMax, setCustomDesktopMax] = useState('')
  const [customMobileMax, setCustomMobileMax] = useState('')
  const [headless, setHeadless] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void window.api.detectBrowsers().then((list) => setBrowsers(list.filter((b) => b.chromium)))
    void window.api.listProxies().then(setProxyList)
  }, [open])

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setAccount(initial?.account ?? '')
    setProfileDir(initial?.profileDir ?? '')
    setCdpPort(initial?.cdpPort ? String(initial.cdpPort) : '')
    setNote(initial?.note ?? '')
    setChannel(initial?.channel ?? 'msedge')
    setProxyId(initial?.proxyId ?? '')
    setProxyFallbacks((initial?.proxyFallbacks ?? []).filter(Boolean))
    setPickerOpen(false)
    setProxyResult(null)
    setHeadless(initial?.headless ?? false)

    if (initial?.desktopMax === 15 && (initial?.mobileMax === 0 || initial?.mobileMax == null)) {
      setCapPreset('taiwan')
      setCustomDesktopMax('15')
      setCustomMobileMax('0')
    } else if (initial?.desktopMax === 30 && (initial?.mobileMax === 0 || initial?.mobileMax == null)) {
      setCapPreset('level1')
      setCustomDesktopMax('30')
      setCustomMobileMax('0')
    } else if (initial?.desktopMax === 90 && initial?.mobileMax === 60) {
      setCapPreset('level2')
      setCustomDesktopMax('90')
      setCustomMobileMax('60')
    } else if (initial?.desktopMax != null || initial?.mobileMax != null) {
      setCapPreset('custom')
      setCustomDesktopMax(String(initial.desktopMax ?? ''))
      setCustomMobileMax(String(initial.mobileMax ?? ''))
    } else {
      setCapPreset('auto')
      setCustomDesktopMax('')
      setCustomMobileMax('')
    }
  }, [open, initial])

  const selectedProxy = proxyList.find((p) => p.id === proxyId) ?? null

  const handleTestProxy = async (): Promise<void> => {
    if (!selectedProxy) return
    setTestingProxy(true)
    setProxyResult(null)
    try {
      const res = await window.api.testSavedProxy(selectedProxy.id)
      setProxyResult(res)
      setProxyList(await window.api.listProxies())
    } finally {
      setTestingProxy(false)
    }
  }

  const submit = async (): Promise<void> => {
    setBusy(true)
    try {
      let dMax: number | null | undefined = undefined
      let mMax: number | null | undefined = undefined
      if (capPreset === 'auto') {
        dMax = null
        mMax = null
      } else if (capPreset === 'taiwan') {
        dMax = 15
        mMax = 0
      } else if (capPreset === 'level1') {
        dMax = 30
        mMax = 0
      } else if (capPreset === 'level2') {
        dMax = 90
        mMax = 60
      } else if (capPreset === 'custom') {
        dMax = customDesktopMax ? Number(customDesktopMax) : null
        mMax = customMobileMax ? Number(customMobileMax) : null
      }

      await onSubmit({
        name: name.trim(),
        account: account.trim(),
        profileDir: profileDir.trim() || undefined,
        cdpPort: cdpPort ? Number(cdpPort) : undefined,
        proxyId: proxyId || null,
        proxyFallbacks: proxyFallbacks.length ? proxyFallbacks : null,
        // giu chuoi proxy cu chi khi KHONG gan proxy tu kho
        proxy: proxyId ? null : (initial?.proxy ?? null),
        note: note.trim() || undefined,
        channel,
        headless,
        desktopMax: dMax,
        mobileMax: mMax
      })
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* p-0 gap-0: padding dat o header/footer/content — ScrollArea sat mep dialog nen thanh cuon
          nam dung vien phai, khong bi le vao trong. flex! vi DialogContent cua shadcn co san `grid`. */}
      <DialogContent onWheel={onWheel} className="z-[60] flex! h-[86vh] max-h-[86vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-[620px]">
        <DialogHeader className="shrink-0 border-b border-[var(--hairline-soft)] px-5 py-3.5 pr-12 text-left">
          <DialogTitle className="text-[19px] leading-tight">
            {initial ? 'Sửa tài khoản' : 'Thêm tài khoản'}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Mỗi tài khoản là một thư mục user-data riêng + một cổng CDP riêng (tự cấp 9400–9500 nếu bỏ trống).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea ref={areaRef} className="min-h-0 flex-1">
          <div className="space-y-4 px-5 py-4">

          {/* ---------- CƠ BẢN ---------- */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="a-name">Tên tài khoản</Label>
                <Input
                  id="a-name"
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ví dụ: Acc chính"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="a-acc">Email / tên hiển thị</Label>
                <Input
                  id="a-acc"
                  value={account}
                  onChange={(e) => setAccount(e.target.value)}
                  placeholder="ten@example.com"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="a-port">Cổng CDP</Label>
                <Input
                  id="a-port"
                  value={cdpPort}
                  onChange={(e) => setCdpPort(e.target.value.replace(/[^\d]/g, ''))}
                  placeholder="tự cấp"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="a-dir">Thư mục profile</Label>
                <Input
                  id="a-dir"
                  value={profileDir}
                  onChange={(e) => setProfileDir(e.target.value)}
                  placeholder="bỏ trống = tự tạo"
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Trình duyệt</Label>
              <div className="grid grid-cols-3 gap-2">
                {(browsers.length ? browsers : FALLBACK).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    title={
                      c.autoSignInRisk
                        ? 'Windows tự gắn tài khoản Microsoft vào profile mới'
                        : 'Profile sạch, không bị gắn tài khoản'
                    }
                    onClick={() => setChannel(c.id)}
                    className={
                      'rounded-[10px] border px-2.5 py-1.5 text-left transition ' +
                      (channel === c.id
                        ? 'border-[var(--ink)] bg-[var(--surface)]'
                        : 'border-[var(--hairline)] hover:bg-[var(--surface)]')
                    }
                  >
                    <div className="truncate text-[13px] font-semibold">{c.name}</div>
                    <div className="mm-micro">
                      v{c.version?.split('.')[0] ?? '?'}
                      {c.autoSignInRisk ? ' · ⚠ MSA' : ''}
                    </div>
                  </button>
                ))}
              </div>
              {browsers.length === 0 ? (
                <div className="mm-micro">
                  Chưa dò được trình duyệt nào — dùng mặc định Edge/Chrome. Xem danh sách ở nút “Trình duyệt”.
                </div>
              ) : null}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="a-note">Ghi chú</Label>
              <Input id="a-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="tuỳ chọn" />
            </div>
          </div>

          {/* ---------- HẠN MỨC ---------- */}
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label>Hạn mức tìm kiếm (cấp độ tài khoản)</Label>
              <div className="grid gap-1.5">
                {[
                  {
                    id: 'auto',
                    label: 'Tự động nhận diện',
                    hint: 'Khuyên dùng — tự đọc hạn mức (15đ / 30đ / 90đ) từ Microsoft Rewards'
                  },
                  {
                    id: 'taiwan',
                    label: 'Đài Loan / khu vực 15đ',
                    hint: 'Desktop 15đ (5 search), không có mobile'
                  },
                  {
                    id: 'level1',
                    label: 'Tài khoản mới (Level 1)',
                    hint: 'Desktop 30đ (10 search), mobile chưa mở (0đ)'
                  },
                  {
                    id: 'level2',
                    label: 'Tài khoản Level 2',
                    hint: 'Desktop 90đ (30 search), mobile 60đ (20 search)'
                  },
                  {
                    id: 'custom',
                    label: 'Tuỳ chỉnh hạn mức',
                    hint: 'Tự nhập điểm tối đa cho desktop và mobile'
                  }
                ].map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setCapPreset(c.id as 'auto' | 'taiwan' | 'level1' | 'level2' | 'custom')}
                    className={
                      'flex items-center justify-between gap-3 rounded-[10px] border px-2.5 py-1.5 text-left transition ' +
                      (capPreset === c.id
                        ? 'border-[var(--ink)] bg-[var(--surface)]'
                        : 'border-[var(--hairline)] hover:bg-[var(--surface)]')
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold">{c.label}</div>
                      <div className="mm-micro truncate">{c.hint}</div>
                    </div>
                    {capPreset === c.id ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                ))}
              </div>
            </div>

            {capPreset === 'custom' ? (
              <div className="grid grid-cols-2 gap-3 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] p-2.5">
                <div className="grid gap-1">
                  <Label htmlFor="c-desktop" className="text-[12px]">
                    Trần desktop (điểm)
                  </Label>
                  <Input
                    id="c-desktop"
                    value={customDesktopMax}
                    onChange={(e) => setCustomDesktopMax(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="30 hoặc 90"
                    className="h-8"
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="c-mobile" className="text-[12px]">
                    Trần mobile (điểm)
                  </Label>
                  <Input
                    id="c-mobile"
                    value={customMobileMax}
                    onChange={(e) => setCustomMobileMax(e.target.value.replace(/[^\d]/g, ''))}
                    placeholder="0 hoặc 60"
                    className="h-8"
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* ---------- NÂNG CAO ---------- */}
          <div className="space-y-3">
            <div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label>Proxy</Label>
                    <Button
                      type="button"
                      variant="tertiary"
                      size="sm"
                      className="h-6 gap-1 px-2 text-[11.5px]"
                      disabled={testingProxy || !selectedProxy}
                      onClick={handleTestProxy}
                    >
                      <Wifi className={testingProxy ? 'size-3 animate-spin' : 'size-3'} />
                      {testingProxy ? 'Đang kiểm tra…' : 'Kiểm tra'}
                    </Button>
                  </div>

                  {/* 1 card duy nhat: bam vao mo hop chon proxy (co tim kiem + sap xep) */}
                  <button
                    type="button"
                    onClick={() => {
                      setPickerMode('main')
                      setPickerOpen(true)
                    }}
                    className="flex items-center justify-between gap-3 rounded-[10px] border border-[var(--hairline)] px-3 py-2 text-left transition hover:bg-[var(--surface)]"
                  >
                    <div className="min-w-0">
                      {selectedProxy ? (
                        <>
                          <div className="flex items-center gap-2 whitespace-nowrap">
                            <span className="truncate text-[13px] font-semibold">{selectedProxy.label}</span>
                            {selectedProxy.lastTest?.ok ? (
                              <Badge variant="success">
                                {selectedProxy.lastTest.latency != null ? `${selectedProxy.lastTest.latency}ms` : 'OK'}
                              </Badge>
                            ) : selectedProxy.lastTest ? (
                              <Badge variant="destructive">LỖI</Badge>
                            ) : (
                              <Badge variant="outline">chưa test</Badge>
                            )}
                          </div>
                          <div className="mm-micro truncate">{selectedProxy.url}</div>
                        </>
                      ) : (
                        <>
                          <div className="text-[13px] font-semibold">Không dùng proxy</div>
                          <div className="mm-micro">Bấm để chọn proxy từ kho ({proxyList.length} proxy)</div>
                        </>
                      )}
                    </div>
                    <span className="shrink-0 text-[12px] font-medium text-[var(--brand-blue-deep)]">Chọn proxy…</span>
                  </button>

                  {/* Proxy dự phòng: thứ tự từ trên xuống, Chromium thử lần lượt khi proxy trước lỗi */}
                  <div className="grid gap-1.5 rounded-[10px] border border-[var(--hairline)] px-2.5 py-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[12.5px] font-semibold">Proxy dự phòng (theo thứ tự)</div>
                        <div className="mm-micro">
                          Thử lần lượt: proxy chính → dự phòng 1 → 2… Hết tất cả thì DỪNG, không dùng IP thật.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        className="h-6 shrink-0 gap-1 px-2 text-[11.5px]"
                        onClick={() => {
                          setPickerMode('fallback')
                          setPickerOpen(true)
                        }}
                      >
                        <Plus className="size-3" /> Thêm
                      </Button>
                    </div>

                    {proxyFallbacks.length === 0 ? (
                      <div className="mm-micro">Chưa có proxy dự phòng.</div>
                    ) : (
                      proxyFallbacks.map((url, i) => (
                        <div key={url + '-' + i} className="flex items-center gap-2 rounded-[8px] bg-[var(--surface)] px-2 py-1">
                          <span className="mm-tabular w-4 shrink-0 text-[11.5px] text-[var(--stone)]">{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px]" title={url}>
                            {url}
                          </span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title="Lên"
                            disabled={i === 0}
                            onClick={() =>
                              setProxyFallbacks((prev) => {
                                const n = [...prev]
                                const tmp = n[i - 1]
                                n[i - 1] = n[i]
                                n[i] = tmp
                                return n
                              })
                            }
                          >
                            <ChevronUp className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title="Xuống"
                            disabled={i === proxyFallbacks.length - 1}
                            onClick={() =>
                              setProxyFallbacks((prev) => {
                                const n = [...prev]
                                const tmp = n[i + 1]
                                n[i + 1] = n[i]
                                n[i] = tmp
                                return n
                              })
                            }
                          >
                            <ChevronDown className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            title="Bỏ khỏi danh sách dự phòng"
                            className="text-[var(--error)]"
                            onClick={() => setProxyFallbacks((prev) => prev.filter((_, k) => k !== i))}
                          >
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {proxyResult ? (
                    <div
                      className={
                        'flex items-center gap-1.5 rounded-[8px] px-2.5 py-1.5 text-[12px] ' +
                        (proxyResult.ok
                          ? 'bg-[var(--success-bg)] text-[var(--success-text)]'
                          : 'bg-[#fdf2f2] text-[var(--error)]')
                      }
                    >
                      {proxyResult.ok ? (
                        <>
                          <span className="font-semibold">✓ IP: {proxyResult.ip}</span>
                          {proxyResult.country ? (
                            <span>
                              ({proxyResult.country}
                              {proxyResult.city ? `, ${proxyResult.city}` : ''})
                            </span>
                          ) : null}
                          {proxyResult.latency ? <span className="opacity-70">· {proxyResult.latency}ms</span> : null}
                        </>
                      ) : (
                        <span>✕ Lỗi: {proxyResult.error}</span>
                      )}
                    </div>
                  ) : null}
                </div>
            </div>

            <div className="flex items-center justify-between rounded-[10px] border border-[var(--hairline)] px-3 py-2">
              <div>
                <div className="text-[13px] font-medium">Chạy ẩn (headless)</div>
                <div className="mm-caption">Bật nếu không cần nhìn cửa sổ khi automation chạy.</div>
              </div>
              <Switch checked={headless} onCheckedChange={setHeadless} />
            </div>
          </div>
          </div>
        </ScrollArea>

        <DialogFooter className="shrink-0 gap-2 border-t border-[var(--hairline-soft)] px-5 py-3">
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {initial ? 'Lưu thay đổi' : 'Tạo tài khoản'}
          </Button>
        </DialogFooter>
      </DialogContent>
      <ProxyPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        items={proxyList}
        rows={rows}
        value={proxyId}
        onPick={(id) => {
          const url = id ? proxyList.find((x) => x.id === id)?.url : null
          if (pickerMode === 'fallback') {
            if (url) setProxyFallbacks((prev) => (prev.includes(url) ? prev : [...prev, url]))
            return
          }
          setProxyId(id)
          setProxyResult(proxyList.find((x) => x.id === id)?.lastTest ?? null)
        }}
      />

    </Dialog>
  )
}
