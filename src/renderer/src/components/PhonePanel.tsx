import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  BatteryCharging,
  Check,
  ChevronRight,
  Info,
  LogIn,
  LogOut,
  RefreshCw,
  Smartphone,
  UserCheck,
  Wifi,
  WifiOff
} from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import type { PhoneSnapshot, RowState } from '@shared/types'

type Account = {
  signedIn: boolean
  email: string | null
  name: string | null
  points: number | null
  todayPoints: string | null
  streak: string | null
  raw: string
  error?: string
}

type Result = {
  ok: boolean
  gained: number
  alreadyDone: boolean
  pointsBefore: number | null
  pointsAfter: number | null
  todayPoints: string | null
  streak: string | null
  error?: string
  at: string
}

/**
 * Tab "Điện thoại" — kịch bản chốt 2026-10-15 (bỏ bind app↔acc, bỏ yêu cầu tự chuyển acc):
 *   App TỰ ĐỌC acc đang đăng nhập trong Bing app (panel avatar có email) → điểm danh cho acc đó →
 *   ghi kết quả vào ĐÚNG dòng theo email → bấm "Đăng xuất & sang acc kế" để app tự đăng xuất và
 *   điền sẵn email acc kế vào form Microsoft (người dùng chỉ nhập mật khẩu).
 */
export function PhonePanel({ rows }: { rows: RowState[] }): React.JSX.Element {
  const [snap, setSnap] = useState<PhoneSnapshot | null>(null)
  const [acct, setAcct] = useState<Account | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [queueIdx, setQueueIdx] = useState(0)

  const loadSnap = async (force = false): Promise<void> => {
    setSnap(force ? await window.api.detectPhoneApps() : await window.api.listPhoneApps(false))
  }

  useEffect(() => {
    void loadSnap(false)
  }, [])

  const device = useMemo(() => snap?.devices.find((d) => d.status === 'online') ?? snap?.devices[0] ?? null, [snap])
  const serial = device?.serial ?? ''

  /** acc trong danh sách khớp email đang đăng nhập trên điện thoại */
  const matched = useMemo(() => {
    if (!acct?.email) return null
    const e = acct.email.toLowerCase()
    return (
      rows.find((r) => (r.profile.account ?? '').toLowerCase().includes(e)) ??
      rows.find((r) => r.profile.name.toLowerCase() === (acct.name ?? '').toLowerCase()) ??
      null
    )
  }, [acct, rows])

  const checkedInCount = rows.filter((r) => results[r.id]?.ok).length

  /** Đọc acc đang đăng nhập trên điện thoại */
  const readAccount = async (silent = false): Promise<Account | null> => {
    if (!serial) {
      if (!silent) toast.error('Chưa thấy thiết bị — cắm cáp + bật USB debugging rồi bấm Dò lại')
      return null
    }
    setBusy('read')
    try {
      const a = await window.api.readPhoneAccount(serial, 0)
      setAcct(a)
      if (!a.signedIn) {
        if (!silent) toast.warning('Bing app chưa đăng nhập acc nào — đăng nhập rồi bấm lại')
      } else if (!silent) {
        toast.success(`Đang đăng nhập: ${a.name ?? a.email} (${a.points ?? '?'} điểm)`)
      }
      return a
    } finally {
      setBusy(null)
    }
  }

  /** Điểm danh cho acc đang đăng nhập, ghi vào dòng khớp email */
  const checkIn = async (): Promise<void> => {
    if (!serial) {
      toast.error('Chưa thấy thiết bị')
      return
    }
    setBusy('checkin')
    try {
      const r = await window.api.checkInPhone(serial, 0)
      const target = matched ?? rows[queueIdx]
      if (target) setResults((prev) => ({ ...prev, [target.id]: { ...r, at: new Date().toISOString() } }))
      if (!r.ok) toast.error(`Điểm danh lỗi: ${r.error ?? 'không rõ'}`)
      else if (r.alreadyDone) toast.info(`Acc này đã điểm danh hôm nay (${r.pointsAfter ?? '?'} điểm)`)
      else toast.success(`+${r.gained} điểm (${r.pointsBefore} → ${r.pointsAfter})${target ? ` — ghi vào “${target.profile.name}”` : ''}`)
      // doc lai vi tri acc sau khi diem danh
      void readAccount(true)
    } catch (e) {
      toast.error(String((e as Error).message).slice(0, 160))
    } finally {
      setBusy(null)
    }
  }

  /** Đăng xuất acc hiện tại + mở form đăng nhập điền sẵn email acc kế */
  const switchNext = async (): Promise<void> => {
    if (!serial) return
    const next = rows[queueIdx + 1] ?? rows[0]
    setBusy('switch')
    try {
      const out = await window.api.signOutPhone(serial)
      if (!out.ok) {
        toast.error(`Đăng xuất lỗi: ${out.error ?? 'không rõ'}`)
        return
      }
      const si = await window.api.signInPhone(serial, next?.profile.account ?? null)
      if (si.ok && si.typedEmail) {
        toast.success(`Đã đăng xuất. Form đăng nhập đã điền sẵn ${next?.profile.account} — nhập mật khẩu là xong.`)
      } else if (si.ok) {
        toast.info(`Đã đăng xuất. Nhập email ${next?.profile.account ?? ''} + mật khẩu trên điện thoại.`)
      } else {
        toast.warning(`Đã đăng xuất nhưng chưa mở được form đăng nhập: ${si.error ?? ''}`)
      }
      if (next) setQueueIdx((i) => Math.min(i + 1, rows.length - 1))
    } catch (e) {
      toast.error(String((e as Error).message).slice(0, 160))
    } finally {
      setBusy(null)
    }
  }

  const anyBusy = busy !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Hàng 1: thiết bị */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 py-1.5">
        <Button
          size="sm"
          className="gap-1.5"
          disabled={anyBusy}
          onClick={() => {
            void (async () => {
              setBusy('detect')
              try {
                await loadSnap(true)
                toast.success('Đã dò lại thiết bị')
              } finally {
                setBusy(null)
              }
            })()
          }}
        >
          <RefreshCw className={busy === 'detect' ? 'size-3.5 animate-spin' : 'size-3.5'} /> Dò lại thiết bị
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          disabled={!serial || anyBusy}
          onClick={() => void readAccount(false)}
        >
          <UserCheck className={busy === 'read' ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {busy === 'read' ? 'Đang đọc…' : 'Đọc acc đang mở'}
        </Button>
        {device ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-[var(--hairline)] px-2.5 py-1">
            <Smartphone className="size-3.5 text-[var(--brand-blue-deep)]" />
            <span className="text-[12.5px] font-semibold">{device.model}</span>
            <span className="mm-micro">{device.serial}</span>
            {device.batteryPct != null ? (
              <span className="mm-micro flex items-center gap-0.5">
                <BatteryCharging className="size-3" />
                {device.batteryPct}%
              </span>
            ) : null}
            {device.status === 'online' ? (
              <Badge variant="success" className="gap-1">
                <Wifi className="size-3" /> online
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <WifiOff className="size-3" /> mất kết nối
              </Badge>
            )}
          </div>
        ) : (
          <span className="text-[12.5px] text-[var(--steel)]">
            Chưa thấy thiết bị — cắm cáp USB + bật <b>USB debugging</b> rồi bấm <b>Dò lại thiết bị</b>.
          </span>
        )}
        <span className="ml-auto text-[12.5px] text-[var(--stone)]">
          Đã điểm danh: <b className="text-emerald-600">{checkedInCount}</b>/{rows.length} acc
        </span>
      </div>

      {/* Hàng 2: acc đang đăng nhập trên điện thoại + 2 nút chính */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--hairline-soft)] bg-[var(--surface)]/50 px-3 py-2">
        <div className="flex min-w-[280px] items-center gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--steel)]">Acc trên điện thoại</span>
          {acct?.signedIn ? (
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-semibold">{acct.name ?? acct.email}</span>
              <span className="mm-micro">{acct.email}</span>
              <Badge variant="outline">{acct.points ?? '?'} điểm</Badge>
              {acct.todayPoints ? <Badge variant="outline">hôm nay {acct.todayPoints}</Badge> : null}
              {acct.streak ? <Badge variant="outline">chuỗi {acct.streak}</Badge> : null}
              {matched ? (
                <Badge variant="success" className="gap-1">
                  <Check className="size-3" /> khớp “{matched.profile.name}”
                </Badge>
              ) : acct.email ? (
                <Badge variant="warning">email này chưa có trong danh sách tài khoản</Badge>
              ) : null}
            </div>
          ) : (
            <span className="text-[12.5px] text-[var(--stone)]">
              chưa đọc — bấm <b>Đọc acc đang mở</b> (hoặc mở Bing app rồi bấm lại)
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" className="gap-1.5" disabled={!serial || anyBusy || !acct?.signedIn} onClick={() => void checkIn()}>
            {busy === 'checkin' ? <RefreshCw className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}
            Điểm danh acc này
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            disabled={!serial || anyBusy || !acct?.signedIn}
            onClick={() => void switchNext()}
            title="Tự đăng xuất acc hiện tại và điền sẵn email acc kế vào form đăng nhập Microsoft"
          >
            {busy === 'switch' ? <RefreshCw className="size-3.5 animate-spin" /> : <LogOut className="size-3.5" />}
            Đăng xuất &amp; sang acc kế
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            className="gap-1.5"
            disabled={!serial || anyBusy}
            onClick={() => void window.api.openPhoneBing(serial).then(() => toast.success('Đã mở Bing app'))}
          >
            <LogIn className="size-3.5" /> Mở Bing app
          </Button>
        </div>
      </div>

      {/* Hướng dẫn */}
      <div className="flex shrink-0 items-start gap-2 border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 py-1.5 text-[12.5px] text-[var(--steel)]">
        <Info className="mt-[1px] size-3.5 shrink-0 text-[var(--brand-blue-deep)]" />
        <div>
          App <b>tự đọc acc đang đăng nhập</b> (email trong panel avatar) nên bạn không cần chọn dòng. Quy trình 1 acc:{' '}
          <b>Đọc acc đang mở → Điểm danh acc này → Đăng xuất &amp; sang acc kế</b> (app tự đăng xuất và điền sẵn email acc
          kế — bạn chỉ nhập mật khẩu), rồi lặp lại. Không cần bind app vào tài khoản.
        </div>
      </div>

      {/* Bảng tài khoản */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Table className="min-w-[900px]">
          <TableHeader>
            <TableRow className="hover:bg-[var(--surface)]">
              <TableHead className="w-[54px]">Bước</TableHead>
              <TableHead className="w-[260px]">Tài khoản</TableHead>
              <TableHead className="w-[210px]">Trạng thái điểm danh</TableHead>
              <TableHead className="w-[180px]">Điểm trên app</TableHead>
              <TableHead className="w-[130px]">Chuỗi</TableHead>
              <TableHead className="w-[150px]">Đang mở trên máy</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-[var(--steel)]">
                  Chưa có tài khoản nào — thêm ở tab <b>Tài khoản</b>.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r, i) => {
                const res = results[r.id]
                const isOpen = matched?.id === r.id
                return (
                  <TableRow key={r.id} className={isOpen ? 'bg-[var(--surface)]' : undefined}>
                    <TableCell>
                      <span className="mm-tabular text-[12.5px] text-[var(--stone)]">{i + 1}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{r.profile.name}</span>
                        {isOpen ? <Badge variant="outline">đang mở trên máy</Badge> : null}
                      </div>
                      <div className="mm-micro truncate">{r.profile.account || r.profile.id}</div>
                    </TableCell>
                    <TableCell>
                      {!res ? (
                        <span className="text-[12.5px] text-[var(--stone)]">chưa chạy</span>
                      ) : !res.ok ? (
                        <span className="text-[12px] text-[var(--error)]">lỗi: {res.error?.slice(0, 55)}</span>
                      ) : res.alreadyDone ? (
                        <Badge variant="outline" className="gap-1">
                          <Check className="size-3" /> đã điểm danh hôm nay
                        </Badge>
                      ) : (
                        <Badge variant="success" className="gap-1">
                          <Check className="size-3" /> +{res.gained} điểm
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="mm-tabular">
                      {res ? (
                        <span className="text-[13px]">
                          {res.pointsBefore ?? '?'} → <b>{res.pointsAfter ?? '?'}</b>
                        </span>
                      ) : isOpen && acct?.points != null ? (
                        <span className="text-[13px]">{acct.points}</span>
                      ) : (
                        <span className="text-[var(--stone)]">—</span>
                      )}
                    </TableCell>
                    <TableCell className="mm-tabular">{res?.streak ?? (isOpen ? (acct?.streak ?? '—') : '—')}</TableCell>
                    <TableCell>
                      {isOpen ? (
                        <Badge variant="success">có</Badge>
                      ) : (
                        <span className="text-[12px] text-[var(--stone)]">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <div className="shrink-0 border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--steel)]">
        Đăng nhập acc nào thì kết quả ghi vào <b>đúng dòng theo email</b>. Chạy lại acc đã điểm danh cũng an toàn (app báo
        “đã điểm danh hôm nay”, không bấm trùng).
      </div>
    </div>
  )
}
