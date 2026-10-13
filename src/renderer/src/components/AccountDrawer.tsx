import { useState } from 'react'
import { Chrome, Copy, Gift, LogIn, LogOut, Play, RefreshCw, Trash2, Wifi } from 'lucide-react'
import type { LogLine, ProxyTestResult, RowState } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Progress } from '@renderer/components/ui/progress'
import { Separator } from '@renderer/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@renderer/components/ui/sheet'
import { fmtNum, pct, timeAgo } from '@renderer/lib/utils'

type Props = {
  row: RowState | null
  open: boolean
  onOpenChange: (v: boolean) => void
  busy: string | null
  logs: LogLine[]
  onRefresh: (id: string) => void
  onOpenBrowser: (id: string) => void
  onCloseBrowser: (id: string) => void
  onLoginWindow: (id: string) => void
  onRun: (id: string, kinds: string[]) => void
  onSignOut: (id: string) => void
  onResetProfile: (id: string) => void
}

function Row({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--hairline-soft)] py-1.5 last:border-0">
      <span className="text-sm text-[var(--charcoal)]">{label}</span>
      <span className="mm-tabular text-sm font-semibold">{value}</span>
    </div>
  )
}

function Bar({
  label,
  progress,
  max
}: {
  label: string
  progress?: number | null
  max?: number | null
}): React.JSX.Element {
  if (max == null) {
    return (
      <div className="py-1.5">
        <div className="flex items-center justify-between text-[13px]">
          <span>{label}</span>
          <span className="text-[var(--stone)] text-[12px]">Chưa có dữ liệu</span>
        </div>
      </div>
    )
  }
  if (max === 0) {
    return (
      <div className="py-1.5">
        <div className="flex items-center justify-between text-[13px]">
          <span>{label}</span>
          <span className="text-[var(--stone)] text-[12px]">0/0 (chưa mở / Level 2 mới có)</span>
        </div>
      </div>
    )
  }
  const prog = progress ?? 0
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between text-[13px]">
        <span>{label}</span>
        <span className="mm-tabular text-[var(--steel)]">
          {prog}/{max}
        </span>
      </div>
      <Progress value={pct(prog, max)} className="mt-1.5 h-1.5" />
    </div>
  )
}

/** Drawer chi tiết tài khoản — mở khi bấm vào dòng hoặc nút “…”. */
export function AccountDrawer(p: Props): React.JSX.Element {
  const [testingProxy, setTestingProxy] = useState(false)
  const [proxyTestResult, setProxyTestResult] = useState<ProxyTestResult | null>(null)

  const row = p.row
  const c = row?.cache ?? null
  const searches =
    ((c?.runs.desktop as { searches?: number } | null)?.searches ?? 0) +
    ((c?.runs.mobile as { searches?: number } | null)?.searches ?? 0)
  const dMax = c?.desktop?.max ?? row?.profile.desktopMax ?? null
  const mMax = c?.mobile?.max ?? row?.profile.mobileMax ?? (dMax !== null && dMax <= 30 ? 0 : null)
  const dProg = c ? (c.desktop?.progress ?? 0) : null
  const mProg = c ? (c.mobile?.progress ?? 0) : null
  const offers = c?.offers ?? (c ? 30 : 0)
  const cap = (dMax ?? 0) + (mMax ?? 0) + offers

  const handleTestProxyInDrawer = async (): Promise<void> => {
    if (!row?.profile.proxy) return
    setTestingProxy(true)
    setProxyTestResult(null)
    try {
      const res = await window.api.testProxy(row.profile.proxy)
      setProxyTestResult(res)
    } finally {
      setTestingProxy(false)
    }
  }

  return (
    <Sheet open={p.open && !!row} onOpenChange={p.onOpenChange} modal={false}>
      <SheetContent
        side="right"
        showOverlay={false}
        className="w-full border-l border-[var(--hairline)] bg-[var(--canvas)] p-0 shadow-[rgba(36,36,36,0.08)_0px_12px_16px_-4px] sm:max-w-[520px]"
      >
        {row ? (
          <div className="flex h-full min-h-0 flex-col">
            <SheetHeader className="border-b border-[var(--hairline-soft)] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <SheetTitle className="truncate text-[20px] font-semibold leading-tight">
                    {row.profile.name}
                  </SheetTitle>
                  <SheetDescription className="truncate text-[12.5px] text-[var(--steel)]">
                    {row.profile.account || row.profile.id}
                  </SheetDescription>
                </div>
                {c?.signedIn ? (
                  <Badge variant="success">đã đăng nhập</Badge>
                ) : (
                  <Badge variant="outline">chưa có dữ liệu</Badge>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {row.browser.running ? (
                  <Badge variant="beta">
                    <Chrome className="size-3" /> {row.browser.cdpUrl?.replace('http://', '') ?? 'đang mở'}
                  </Badge>
                ) : (
                  <Badge variant="outline">browser đóng</Badge>
                )}
                {row.profile.cdpPort ? (
                  <Badge variant="outline">
                    {row.profile.channel === 'chrome' ? 'Chrome' : 'Edge'} · CDP :{row.profile.cdpPort}
                  </Badge>
                ) : null}
                <Badge variant="secondary">cập nhật {timeAgo(c?.cachedAt)}</Badge>
                {row.run.running ? <Badge variant="coral">đang chạy</Badge> : null}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-4 overflow-auto px-4 py-3.5">
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="tertiary"
                  className="gap-1.5"
                  disabled={p.busy === `browser:${row.id}`}
                  onClick={() => (row.browser.running ? p.onCloseBrowser(row.id) : p.onOpenBrowser(row.id))}
                >
                  <Chrome className="size-3.5" /> {row.browser.running ? 'Đóng trình duyệt' : 'Mở trình duyệt'}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={p.busy === `refresh:${row.id}`}
                  onClick={() => p.onRefresh(row.id)}
                >
                  <RefreshCw className={p.busy === `refresh:${row.id}` ? 'size-3.5 animate-spin' : 'size-3.5'} /> Cập nhật
                </Button>
                <Button size="sm" variant="tertiary" className="gap-1.5" onClick={() => p.onLoginWindow(row.id)}>
                  <LogIn className="size-3.5" /> Đăng nhập
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="gap-1.5"
                  disabled={row.run.running}
                  onClick={() => p.onRun(row.id, ['desktop', 'daily', 'earn', 'mobile'])}
                >
                  <Play className="size-3.5" /> Chạy
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="gap-1.5"
                  title="Xoá cookie Microsoft/Bing của profile này để đăng nhập tài khoản khác"
                  onClick={() => p.onSignOut(row.id)}
                >
                  <LogOut className="size-3.5" /> Đăng xuất
                </Button>
              </div>

              {c?.signedIn ? (
                <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-[12.5px]">
                  <div className="font-semibold">Tài khoản đang đăng nhập</div>
                  <div className="text-[var(--steel)]">
                    {row.profile.account || '—'} · đọc được {fmtNum(c.points)} điểm
                  </div>
                  <div className="mm-micro mt-1">
                    Nếu Edge tự đăng nhập nhầm tài khoản Windows: bấm <strong>Đăng xuất</strong> rồi mở lại trình duyệt
                    và đăng nhập tài khoản mong muốn. Trường hợp profile mới bị dính sẵn tài khoản, dùng “Xoá dữ liệu
                    profile”.
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-[12px] border border-[var(--hairline)] px-3 py-2">
                  <div className="text-[12px] font-semibold text-[var(--steel)]">Điểm hiện có</div>
                  <div className="mm-tabular text-[22px] font-semibold leading-tight">{fmtNum(c?.points)}</div>
                  <div className="mm-micro">{c?.level ? `${c.level} Member` : '—'}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--hairline)] px-3 py-2">
                  <div className="text-[12px] font-semibold text-[var(--steel)]">Điểm hôm nay</div>
                  <div className="mm-tabular text-[22px] font-semibold leading-tight text-[var(--success-text)]">
                    {fmtNum(c?.todayPoints ?? 0)}
                  </div>
                  <div className="mm-micro">
                    {cap > 0 ? `trần ngày ~${fmtNum(cap)}` : 'trần ngày: chưa có dữ liệu'}
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-0.5 text-[12px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                  Tiến độ hôm nay
                </div>
                <Bar label="Desktop Bing search" progress={dProg} max={dMax} />
                <Bar label="Mobile Bing search" progress={mProg} max={mMax} />
                <Bar label="Daily set" progress={c?.dailySet?.progress ?? 0} max={c?.dailySet?.max ?? 3} />
                <Bar label="Bing Search streak" progress={c?.searchStreak?.progress ?? 0} max={c?.searchStreak?.max ?? 1} />
                <Bar label="Edge Minutes" progress={c?.edgeMinutes?.progress ?? 0} max={c?.edgeMinutes?.max ?? 30} />
                <Bar label="Bing App Check-in" progress={c?.checkIn?.progress ?? 0} max={c?.checkIn?.max ?? 1} />
              </div>

              <Separator />

              <div>
                <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                  Daily set hôm nay
                </div>
                {(c?.setLinks ?? []).length === 0 ? (
                  <div className="mm-caption py-2">Chưa đọc được thẻ nào.</div>
                ) : (
                  (c?.setLinks ?? []).map((l) => (
                    <div
                      key={l.href}
                      className="flex items-center justify-between gap-3 border-b border-[var(--hairline-soft)] py-1.5 last:border-0"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{l.text || '(không tiêu đề)'}</div>
                        <div className="mm-micro truncate">{safeHost(l.href)}</div>
                      </div>
                      {l.reward ? (
                        <Badge variant="outline">
                          <Gift className="size-3" /> +{l.reward}
                        </Badge>
                      ) : null}
                    </div>
                  ))
                )}
              </div>

              <Separator />

              <div>
                <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                  Lịch sử &amp; thao tác hôm nay
                </div>
                <Row label="Điểm tháng này" value={fmtNum(c?.month)} />
                <Row label="Điểm năm nay" value={fmtNum(c?.year)} />
                <Row label="Lifetime" value={fmtNum(c?.lifetime)} />
                <Row label="Search tool đã chạy" value={String(searches)} />
                <Row
                  label="Daily set tool đã click"
                  value={String(((c?.runs.daily as { items?: unknown[] } | null)?.items ?? []).length)}
                />
                <Row label="Offers" value={fmtNum(c?.offers)} />
              </div>

              <Separator />

              <div>
                <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                  Log của tài khoản này
                </div>
                <div className="max-h-[170px] overflow-auto rounded-[8px] bg-[var(--surface)] p-2.5 font-mono text-[11px] leading-[1.55]">
                  {p.logs.length === 0 ? (
                    <span className="text-[var(--stone)]">Chưa có log cho tài khoản này.</span>
                  ) : (
                    p.logs.slice(-120).map((l, i) => (
                      <div key={`${l.at}-${i}`} className="whitespace-pre-wrap">
                        <span className="text-[var(--stone)]">{l.at.slice(11)} </span>
                        <span className="font-semibold uppercase opacity-70">[{l.level}]</span> {l.msg}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                    Proxy mạng
                  </span>
                  {row.profile.proxy ? (
                    <Button
                      size="sm"
                      variant="tertiary"
                      className="h-6 gap-1 px-2 text-[11px]"
                      disabled={testingProxy}
                      onClick={handleTestProxyInDrawer}
                    >
                      <Wifi className={testingProxy ? 'size-3 animate-spin' : 'size-3'} />
                      {testingProxy ? 'Đang kiểm tra…' : 'Kiểm tra'}
                    </Button>
                  ) : null}
                </div>
                {row.profile.proxy ? (
                  <div className="space-y-1.5">
                    <code className="block break-all rounded-[6px] bg-[var(--surface)] px-2 py-1 text-[12px]">
                      {row.profile.proxy}
                    </code>
                    {proxyTestResult ? (
                      <div
                        className={
                          'rounded-[6px] px-2 py-1 text-[11.5px] ' +
                          (proxyTestResult.ok
                            ? 'bg-[var(--success-bg)] text-[var(--success-text)]'
                            : 'bg-[#fdf2f2] text-[var(--error)]')
                        }
                      >
                        {proxyTestResult.ok
                          ? `✓ IP: ${proxyTestResult.ip} (${proxyTestResult.country || ''}${proxyTestResult.city ? ', ' + proxyTestResult.city : ''}) · ${proxyTestResult.latency}ms`
                          : `✕ Lỗi: ${proxyTestResult.error}`}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="text-[12.5px] text-[var(--stone)]">
                    Không dùng proxy (kết nối trực tiếp từ máy)
                  </div>
                )}
              </div>

              <Separator />

              <div>
                <div className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-[var(--steel)]">
                  Thư mục profile
                </div>
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded-[6px] bg-[var(--surface)] px-2 py-1.5 text-[12px]">
                    {row.profile.profileDir}
                  </code>
                  <Button
                    size="icon-sm"
                    variant="tertiary"
                    title="Copy đường dẫn"
                    onClick={() => void navigator.clipboard.writeText(row.profile.profileDir)}
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
                {row.profile.note ? <div className="mm-caption mt-2">{row.profile.note}</div> : null}

                <Button
                  size="sm"
                  variant="danger"
                  className="mt-3 gap-1.5"
                  title="Xoá toàn bộ dữ liệu profile (cookie, đăng nhập) để làm lại từ đầu"
                  onClick={() => p.onResetProfile(row.id)}
                >
                  <Trash2 className="size-3.5" /> Xoá dữ liệu profile (làm lại từ đầu)
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function safeHost(href: string): string {
  try {
    const u = new URL(href)
    const q = u.searchParams.get('q')
    return q ? `${u.host} · ${decodeURIComponent(q).slice(0, 40)}` : u.host
  } catch {
    return href.slice(0, 50)
  }
}
