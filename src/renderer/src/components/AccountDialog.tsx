import { useEffect, useState } from 'react'
import { Wifi } from 'lucide-react'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { Check } from 'lucide-react'
import type { DetectedBrowser, Profile, ProxyItem, ProxyTestResult } from '@shared/types'

const FALLBACK: DetectedBrowser[] = [
  { id: 'msedge', name: 'Microsoft Edge', exe: '', version: null, chromium: true, autoSignInRisk: true },
  { id: 'chrome', name: 'Google Chrome', exe: '', version: null, chromium: true, autoSignInRisk: false }
]

export function AccountDialog({
  open,
  onOpenChange,
  initial,
  onSubmit
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial: Profile | null
  onSubmit: (patch: Partial<Profile>) => Promise<void>
}): React.JSX.Element {
  const [name, setName] = useState('')
  const [account, setAccount] = useState('')
  const [profileDir, setProfileDir] = useState('')
  const [cdpPort, setCdpPort] = useState('')
  const [note, setNote] = useState('')
  const [channel, setChannel] = useState('msedge')
  const [proxyId, setProxyId] = useState('')
  const [proxyList, setProxyList] = useState<ProxyItem[]>([])
  const [manageProxyHint, setManageProxyHint] = useState(false)
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
    setManageProxyHint(false)
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
      <DialogContent className="z-[60] flex max-h-[86vh] flex-col overflow-hidden sm:max-w-[620px]">
        <DialogHeader>
          <DialogTitle className="text-[20px] leading-tight">
            {initial ? 'Sửa tài khoản' : 'Thêm tài khoản'}
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Mỗi tài khoản là một thư mục user-data riêng + một cổng CDP riêng (tự cấp 9400–9500 nếu bỏ trống).
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="basic" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="grid w-full shrink-0 grid-cols-3">
            <TabsTrigger value="basic">Cơ bản</TabsTrigger>
            <TabsTrigger value="limit">Hạn mức</TabsTrigger>
            <TabsTrigger value="adv">Nâng cao</TabsTrigger>
          </TabsList>

          {/* ---------- TAB 1: CƠ BẢN ---------- */}
          <TabsContent value="basic" className="mt-3 min-h-0 flex-1 space-y-3 overflow-auto pr-0.5">
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
          </TabsContent>

          {/* ---------- TAB 2: HẠN MỨC ---------- */}
          <TabsContent value="limit" className="mt-3 min-h-0 flex-1 space-y-3 overflow-auto pr-0.5">
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
          </TabsContent>

          {/* ---------- TAB 3: NÂNG CAO ---------- */}
          <TabsContent value="adv" className="mt-3 min-h-0 flex-1 space-y-3 overflow-auto pr-0.5">
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Proxy (chọn từ kho)</Label>
                <div className="flex items-center gap-1">
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
                  <Button
                    type="button"
                    variant="tertiary"
                    size="sm"
                    className="h-6 gap-1 px-2 text-[11.5px]"
                    onClick={() => setManageProxyHint(true)}
                  >
                    Quản lý kho proxy
                  </Button>
                </div>
              </div>
              <div className="grid gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setProxyId('')
                    setProxyResult(null)
                  }}
                  className={
                    'flex items-center justify-between rounded-[10px] border px-2.5 py-1.5 text-left transition ' +
                    (proxyId === ''
                      ? 'border-[var(--ink)] bg-[var(--surface)]'
                      : 'border-[var(--hairline)] hover:bg-[var(--surface)]')
                  }
                >
                  <div>
                    <div className="text-[13px] font-semibold">Không dùng proxy</div>
                    <div className="mm-micro">Đi trực tiếp bằng mạng của máy</div>
                  </div>
                  {proxyId === '' ? <Check className="size-4 shrink-0" /> : null}
                </button>
                {proxyList.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setProxyId(p.id)
                      setProxyResult(p.lastTest ?? null)
                    }}
                    className={
                      'flex items-center justify-between gap-3 rounded-[10px] border px-2.5 py-1.5 text-left transition ' +
                      (proxyId === p.id
                        ? 'border-[var(--ink)] bg-[var(--surface)]'
                        : 'border-[var(--hairline)] hover:bg-[var(--surface)]')
                    }
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold">{p.label}</div>
                      <div className="mm-micro truncate">
                        {p.url}
                        {p.lastTest?.ok
                          ? ` · IP ${p.lastTest.ip}${p.lastTest.country ? ` (${p.lastTest.country})` : ''}`
                          : p.lastTest
                            ? ' · test lỗi'
                            : ' · chưa test'}
                      </div>
                    </div>
                    {proxyId === p.id ? <Check className="size-4 shrink-0" /> : null}
                  </button>
                ))}
                {proxyList.length === 0 ? (
                  <div className="mm-micro">
                    Kho proxy đang trống — sang tab <b>Proxy</b> để thêm, sau đó quay lại đây chọn.
                  </div>
                ) : null}
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
              {manageProxyHint ? (
                <div className="mm-micro">
                  Đóng hộp này, bấm tab <b>Proxy</b> trên thanh trên để thêm/sửa/kiểm tra proxy, rồi mở lại tài khoản
                  để gán.
                </div>
              ) : null}
            </div>

            <div className="flex items-center justify-between rounded-[10px] border border-[var(--hairline)] px-3 py-2">
              <div>
                <div className="text-[13px] font-medium">Chạy ẩn (headless)</div>
                <div className="mm-caption">Bật nếu không cần nhìn cửa sổ khi automation chạy.</div>
              </div>
              <Switch checked={headless} onCheckedChange={setHeadless} />
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 pt-1">
          <Button variant="tertiary" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {initial ? 'Lưu thay đổi' : 'Tạo tài khoản'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
