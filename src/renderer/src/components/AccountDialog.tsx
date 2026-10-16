import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Check, ChevronDown, ChevronUp, Plus, Trash2, Wifi } from 'lucide-react'
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
import { ScrollArea } from '@renderer/components/ui/scroll-area'
import { ProxyPickerDialog } from '@renderer/components/ProxyPickerDialog'
import { Badge } from '@renderer/components/ui/badge'
import { QuickProxyFill } from './QuickProxyFill'
import { parseProxyCount, selectQuickProxies } from '@renderer/lib/proxy-quick-fill'
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
  const [quickFillCount, setQuickFillCount] = useState('3')
  const [testingProxy, setTestingProxy] = useState(false)
  const [proxyResult, setProxyResult] = useState<ProxyTestResult | null>(null)
  const [browsers, setBrowsers] = useState<DetectedBrowser[]>([])
  const [capPreset, setCapPreset] = useState<'auto' | 'taiwan' | 'level1' | 'level2' | 'custom'>('auto')
  const [customDesktopMax, setCustomDesktopMax] = useState('')
  const [customMobileMax, setCustomMobileMax] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    void window.api.detectBrowsers().then((list) => setBrowsers(list.filter((b) => b.chromium)))
    void window.api.listProxies().then((list) => {
      setProxyList(list)
      // Tự động map nếu initial có proxy URL nhưng chưa có proxyId
      setProxyId((cur) => {
        if (!cur && initial?.proxy) {
          const match = list.find((p) => p.url === initial.proxy)
          if (match) return match.id
        }
        return cur
      })
    })
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setAccount(initial?.account ?? '')
    setProfileDir(initial?.profileDir ?? '')
    setCdpPort(initial?.cdpPort ? String(initial.cdpPort) : '')
    setNote(initial?.note ?? '')
    setChannel(initial?.channel ?? 'msedge')

    let initialPid = initial?.proxyId ?? ''
    if (!initialPid && initial?.proxy) {
      const match = proxyList.find((p) => p.url === initial.proxy)
      if (match) initialPid = match.id
    }
    setProxyId(initialPid)
    setProxyFallbacks((initial?.proxyFallbacks ?? []).filter(Boolean))
    setPickerOpen(false)
    setProxyResult(null)

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
  }, [open, initial, proxyList])

  const selectedProxy = proxyList.find((p) => p.id === proxyId) ?? null

  const selectedProxyUsers = useMemo(() => {
    if (!selectedProxy) return []
    return rows
      .filter((r) => !initial || r.id !== initial.id)
      .filter(
        (r) =>
          r.profile.proxyId === selectedProxy.id ||
          r.profile.proxy === selectedProxy.url ||
          r.profile.proxyFallbacks?.includes(selectedProxy.url)
      )
      .map((r) => r.profile.name)
  }, [selectedProxy, rows, initial])

  const handleQuickFillCleanProxies = (): boolean => {
    const count = parseProxyCount(quickFillCount)
    if (count === null) {
      toast.error('Số proxy phải là số nguyên từ 1 trở lên.')
      return false
    }
    if (!proxyList.length) {
      toast.error('Kho proxy đang trống! Hãy thêm proxy ở tab "Proxy" trước.')
      return false
    }

    const picks = selectQuickProxies(proxyList, rows, initial?.id, count)

    if (!picks.length) {
      toast.error('Không còn proxy chưa gắn tài khoản khác và không bị lỗi. Hãy thêm hoặc kiểm tra lại proxy.')
      return false
    }

    // Gán:
    // Proxy 0 -> làm Proxy chính
    setProxyId(picks[0].id)
    setProxyResult(picks[0].lastTest ?? null)

    // Số còn lại làm dự phòng; chọn 1 thì xoá toàn bộ dự phòng cũ.
    const fallbacks = picks.slice(1).map((p) => p.url)
    setProxyFallbacks(fallbacks)

    const mainLat = picks[0].lastTest?.latency ? ` (${picks[0].lastTest.latency}ms)` : ''
    const fbInfo = picks
      .slice(1)
      .map((p) => `${p.label}${p.lastTest?.latency ? ` (${p.lastTest.latency}ms)` : ''}`)
      .join(', ')
    const untested = picks.filter(item => !item.lastTest).length
    toast[picks.length < count ? 'warning' : 'success'](picks.length < count
      ? `Chỉ gán được ${picks.length}/${count} proxy phù hợp trong kho.`
      : `Đã gán nhanh ${picks.length} proxy.`, {
      description: `Chính: ${picks[0].label}${mainLat}${fbInfo ? ` • Dự phòng: ${fbInfo}` : ''}${untested ? ` • ${untested} proxy chưa test` : ''}`
    })
    return true
  }

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
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Label className="text-[13px] font-semibold">Proxy & Dự phòng</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <QuickProxyFill value={quickFillCount} onValueChange={setQuickFillCount} onFill={handleQuickFillCleanProxies} />
                      {selectedProxy ? (
                        <Button
                          type="button"
                          variant="tertiary"
                          size="sm"
                          className="h-6.5 gap-1 px-2 text-[11.5px]"
                          disabled={testingProxy}
                          onClick={handleTestProxy}
                        >
                          <Wifi className={testingProxy ? 'size-3 animate-spin' : 'size-3'} />
                          {testingProxy ? 'Đang kiểm tra…' : 'Kiểm tra'}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Card Proxy chính: thể hiện rõ ràng proxy đã chọn, ping và trạng thái sạch / trùng acc khác */}
                  <div className="flex flex-col gap-2 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]/40 p-3 text-left transition hover:border-[var(--hairline-strong)]">
                    {selectedProxy ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[var(--ink)]">{selectedProxy.label}</span>
                            {selectedProxy.lastTest?.ok ? (
                              <Badge variant="success" className="gap-1 text-[11px]">
                                {selectedProxy.lastTest.latency != null ? `${selectedProxy.lastTest.latency}ms` : 'OK'}
                              </Badge>
                            ) : selectedProxy.lastTest ? (
                              <Badge variant="destructive" className="text-[11px]">
                                LỖI
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[11px]">
                                chưa test
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              variant="tertiary"
                              className="h-6 px-2 text-[11.5px] text-[var(--brand-blue-deep)]"
                              onClick={() => {
                                setPickerMode('main')
                                setPickerOpen(true)
                              }}
                            >
                              Đổi proxy
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[11.5px] text-[var(--stone)] hover:text-[var(--error)]"
                              onClick={() => {
                                setProxyId('')
                                setProxyResult(null)
                                toast.info('Đã chuyển sang không dùng proxy chính.')
                              }}
                            >
                              Bỏ chọn
                            </Button>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 text-[12px] font-mono text-[var(--steel)]">
                          <code className="truncate">{selectedProxy.url}</code>
                          {selectedProxy.lastTest?.ip ? (
                            <span className="text-[11px] font-sans text-[var(--stone)]">
                              (IP: {selectedProxy.lastTest.ip}
                              {selectedProxy.lastTest.country ? ` · ${selectedProxy.lastTest.country}` : ''})
                            </span>
                          ) : null}
                        </div>

                        {/* Báo rõ ràng proxy này đã được sài ở đâu chưa */}
                        <div className="flex items-center gap-2 border-t border-[var(--hairline-soft)] pt-1.5">
                          {selectedProxyUsers.length === 0 ? (
                            <span className="flex items-center gap-1 text-[11.5px] font-medium text-emerald-600">
                              <Check className="size-3.5" /> Chưa tài khoản nào dùng (Proxy sạch hoàn toàn)
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[11.5px] font-medium text-amber-600">
                              ⚠️ Đang dùng bởi {selectedProxyUsers.length} tài khoản khác: {selectedProxyUsers.join(', ')}
                            </span>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between py-1">
                        <div>
                          <div className="text-[13px] font-semibold text-[var(--ink)]">Không dùng proxy chính</div>
                          <div className="mm-micro">
                            Bấm nút bên phải hoặc "⚡ Gán nhanh" để chọn proxy từ kho ({proxyList.length} proxy)
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="tertiary"
                          className="h-7 px-2.5 text-[12px] font-medium text-[var(--brand-blue-deep)]"
                          onClick={() => {
                            setPickerMode('main')
                            setPickerOpen(true)
                          }}
                        >
                          Chọn proxy…
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Proxy dự phòng: thứ tự từ trên xuống, Chromium tự fallback khi proxy trước lỗi */}
                  <div className="grid gap-2 rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)]/30 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[12.5px] font-semibold">
                          Proxy dự phòng ({proxyFallbacks.length})
                        </div>
                        <div className="mm-micro">
                          Thử lần lượt: proxy chính → dự phòng 1 → 2… Hết tất cả thì DỪNG, không dùng IP thật.
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="tertiary"
                        size="sm"
                        className="h-6.5 shrink-0 gap-1 px-2.5 text-[11.5px]"
                        onClick={() => {
                          setPickerMode('fallback')
                          setPickerOpen(true)
                        }}
                      >
                        <Plus className="size-3" /> Thêm dự phòng
                      </Button>
                    </div>

                    {proxyFallbacks.length === 0 ? (
                      <div className="rounded-[8px] border border-dashed border-[var(--hairline)] p-2 text-center text-[12px] text-[var(--stone)]">
                        Chưa có proxy dự phòng. Bấm "Thêm dự phòng" hoặc nút "⚡ Gán nhanh" phía trên.
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {proxyFallbacks.map((url, i) => {
                          const item = proxyList.find((p) => p.url === url)
                          const fbUsers = rows
                            .filter((r) => !initial || r.id !== initial.id)
                            .filter(
                              (r) =>
                                r.profile.proxyId === item?.id ||
                                r.profile.proxy === url ||
                                r.profile.proxyFallbacks?.includes(url)
                            )
                            .map((r) => r.profile.name)
                          const isClean = fbUsers.length === 0

                          return (
                            <div
                              key={url + '-' + i}
                              className="flex items-center justify-between gap-2 rounded-[8px] border border-[var(--hairline-soft)] bg-[var(--canvas)] px-2.5 py-1.5"
                            >
                              <span className="mm-tabular w-5 shrink-0 font-semibold text-[11.5px] text-[var(--stone)]">
                                #{i + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="truncate text-[12.5px] font-medium text-[var(--ink)]">
                                    {item?.label ?? url}
                                  </span>
                                  {item?.lastTest?.ok && item.lastTest.latency != null ? (
                                    <Badge variant="success" className="h-4 px-1 text-[10px]">
                                      {item.lastTest.latency}ms
                                    </Badge>
                                  ) : item?.lastTest ? (
                                    <Badge variant="destructive" className="h-4 px-1 text-[10px]">
                                      LỖI
                                    </Badge>
                                  ) : null}
                                  {isClean ? (
                                    <span className="text-[11px] font-medium text-emerald-600">✓ Sạch</span>
                                  ) : (
                                    <span
                                      className="truncate text-[11px] text-amber-600"
                                      title={`Đang dùng bởi: ${fbUsers.join(', ')}`}
                                    >
                                      ⚠️ Trùng {fbUsers.length} acc
                                    </span>
                                  )}
                                </div>
                                {item ? (
                                  <div className="truncate font-mono text-[11px] text-[var(--stone)]">{url}</div>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-0.5">
                                <Button
                                  type="button"
                                  size="icon-sm"
                                  variant="ghost"
                                  className="size-6 text-[var(--steel)]"
                                  title="Đưa lên trước"
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
                                  className="size-6 text-[var(--steel)]"
                                  title="Đưa xuống sau"
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
                                  className="size-6 text-[var(--stone)] hover:text-[var(--error)]"
                                  title="Bỏ khỏi danh sách dự phòng"
                                  onClick={() =>
                                    setProxyFallbacks((prev) => {
                                      const removed = prev[i]
                                      const itemRemoved = proxyList.find((x) => x.url === removed)
                                      toast.info(`Đã xoá dự phòng: ${itemRemoved?.label ?? removed}`)
                                      return prev.filter((_, idx) => idx !== i)
                                    })
                                  }
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
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
          const item = id ? proxyList.find((x) => x.id === id) : null
          const url = item?.url
          if (pickerMode === 'fallback') {
            if (url) {
              setProxyFallbacks((prev) => {
                if (prev.includes(url)) {
                  toast.info('Proxy này đã có trong danh sách dự phòng.')
                  return prev
                }
                toast.success(`Đã thêm proxy dự phòng: ${item?.label ?? url}`)
                return [...prev, url]
              })
            }
            return
          }
          setProxyId(id)
          setProxyResult(item?.lastTest ?? null)
          toast.success(id ? `Đã chọn proxy chính: ${item?.label ?? id}` : 'Đã chuyển sang không dùng proxy')
        }}
        quickFillCount={quickFillCount}
        onQuickFillCountChange={setQuickFillCount}
        onQuickFill={handleQuickFillCleanProxies}
      />

    </Dialog>
  )
}
