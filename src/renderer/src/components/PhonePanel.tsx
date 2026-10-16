import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  BatteryCharging,
  Check,
  CircleAlert,
  Play,
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

type Cached = { name: string; email: string }
type Result = {
  ok: boolean
  gained: number
  alreadyDone: boolean
  points: number | null
  switched: boolean
  error?: string
}

/**
 * Tab "Điện thoại" — flow chốt 2026-10-15 (sau khi phát hiện Bing app có sẵn DANH SÁCH ACC ĐÃ LƯU):
 *   Chuyển acc = bấm chọn trong "Chọn một tài khoản để đăng nhập" — KHÔNG cần mật khẩu.
 *   Vì vậy app chạy trọn danh sách: chuyển acc → điểm danh → acc kế → … tự động.
 *   Không bind app vào acc; kết quả ghi vào dòng theo EMAIL.
 */
export function PhonePanel({ rows }: { rows: RowState[] }): React.JSX.Element {
  const [snap, setSnap] = useState<PhoneSnapshot | null>(null)
  const [cached, setCached] = useState<Cached[] | null>(null)
  const [signedIn, setSignedIn] = useState<{ name: string | null; email: string | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, Result>>({})
  const [log, setLog] = useState<string[]>([])

  const loadSnap = async (force = false): Promise<void> => {
    setSnap(force ? await window.api.detectPhoneApps() : await window.api.listPhoneApps(false))
  }

  useEffect(() => {
    // Do THAT khi mo tab (adb nhanh, khong mo trinh duyet) de khong hien thiet bi cu da rut
    void loadSnap(true)
    const off = window.api.onPhoneAutoProgress(({ row, index, total }) => {
      setLog((l) => [
        ...l,
        `${index}/${total} ${row.email}: ${
          !row.switched ? `chuyển acc lỗi (${row.error ?? ''})` : row.ok ? (row.alreadyDone ? 'đã điểm danh hôm nay' : `+${row.gained} điểm`) : `lỗi điểm danh (${row.error ?? ''})`
        }`
      ])
    })
    return off
  }, [])

  const device = useMemo(() => snap?.devices.find((d) => d.status === 'online') ?? snap?.devices[0] ?? null, [snap])
  const serial = device?.serial ?? ''

  /** email -> dòng tài khoản */
  const byEmail = useMemo(() => {
    const m = new Map<string, RowState>()
    for (const r of rows) {
      const e = (r.profile.account ?? '').toLowerCase()
      if (e) m.set(e, r)
    }
    return m
  }, [rows])

  const cachedSet = useMemo(() => new Set((cached ?? []).map((c) => c.email.toLowerCase())), [cached])
  const doneCount = rows.filter((r) => results[r.id]?.ok).length

  const scan = async (): Promise<void> => {
    if (!serial) {
      toast.error('Chưa thấy thiết bị — cắm cáp + bật USB debugging rồi bấm Dò lại')
      return
    }
    setBusy('scan')
    try {
      const p = await window.api.listPhoneAccounts(serial)
      if (!p.ok) {
        toast.error(p.error ?? 'không đọc được trang tài khoản')
        return
      }
      setCached(p.accounts)
      setSignedIn({ name: p.signedInName, email: p.signedInEmail })
      const miss = rows.filter((r) => r.profile.account && !p.accounts.some((a) => a.email.toLowerCase() === r.profile.account!.toLowerCase()))
      toast.success(
        `Máy có ${p.accounts.length} acc đã lưu${p.signedInEmail ? ` · đang đăng nhập ${p.signedInEmail}` : ''}${
          miss.length ? ` · ${miss.length} acc chưa có trên máy` : ''
        }`
      )
    } finally {
      setBusy(null)
    }
  }

  const checkInCurrent = async (): Promise<void> => {
    if (!serial) return
    setBusy('one')
    try {
      const r = await window.api.checkInPhone(serial, 0)
      const res: Result = {
        ok: r.ok,
        gained: r.gained,
        alreadyDone: r.alreadyDone,
        points: r.pointsAfter,
        switched: true,
        error: r.error
      }
      const target = signedIn?.email ? byEmail.get(signedIn.email.toLowerCase()) : null
      if (target) setResults((prev) => ({ ...prev, [target.id]: res }))
      if (!r.ok) toast.error(`Điểm danh lỗi: ${r.error ?? 'không rõ'}`)
      else if (r.alreadyDone) toast.info(`Acc đang mở đã điểm danh hôm nay (${r.pointsAfter ?? '?'} điểm)`)
      else toast.success(`+${r.gained} điểm (${r.pointsBefore} → ${r.pointsAfter})`)
    } finally {
      setBusy(null)
    }
  }

  /** Chuyển sang 1 acc cụ thể rồi điểm danh */
  const switchAndCheckIn = async (row: RowState): Promise<void> => {
    if (!serial) return
    const email = row.profile.account ?? ''
    if (!email) {
      toast.error('Tài khoản này chưa có email — điền ở Sửa tài khoản')
      return
    }
    setBusy(row.id)
    try {
      const sw = await window.api.switchPhoneAccount(serial, email)
      if (!sw.ok) {
        setResults((prev) => ({ ...prev, [row.id]: { ok: false, gained: 0, alreadyDone: false, points: null, switched: false, error: sw.error } }))
        toast.error(`Chuyển acc lỗi: ${sw.error}`)
        return
      }
      const r = await window.api.checkInPhone(serial, 0)
      const res: Result = {
        ok: r.ok,
        gained: r.gained,
        alreadyDone: r.alreadyDone,
        points: r.pointsAfter,
        switched: true,
        error: r.error
      }
      setResults((prev) => ({ ...prev, [row.id]: res }))
      setSignedIn({ name: row.profile.name, email })
      if (!r.ok) toast.error(`Điểm danh lỗi: ${r.error ?? 'không rõ'}`)
      else if (r.alreadyDone) toast.info(`“${row.profile.name}” đã điểm danh hôm nay`)
      else toast.success(`“${row.profile.name}”: +${r.gained} điểm (${r.pointsBefore} → ${r.pointsAfter})`)
    } finally {
      setBusy(null)
    }
  }

  /** Chạy tự động cả danh sách: chuyển acc + điểm danh từng acc một */
  const runAll = async (): Promise<void> => {
    if (!serial) return
    const targets = rows
      .filter((r) => r.profile.account)
      .map((r) => ({ email: r.profile.account as string, name: r.profile.name }))
    if (!targets.length) {
      toast.error('Không có tài khoản nào có email')
      return
    }
    setBusy('all')
    setLog([`Bắt đầu chạy ${targets.length} acc…`])
    try {
      const out = await window.api.autoCheckInPhone(serial, targets)
      setResults((prev) => {
        const next = { ...prev }
        for (const o of out) {
          const row = byEmail.get(o.email.toLowerCase())
          if (row) next[row.id] = { ok: o.ok, gained: o.gained, alreadyDone: o.alreadyDone, points: o.points, switched: o.switched, error: o.error }
        }
        return next
      })
      const gained = out.reduce((s, o) => s + (o.gained || 0), 0)
      const failed = out.filter((o) => !o.switched || !o.ok).length
      if (failed) toast.warning(`Xong: +${gained} điểm · ${failed} acc lỗi (xem log bên dưới)`)
      else toast.success(`Xong cả ${out.length} acc: +${gained} điểm`)
    } finally {
      setBusy(null)
    }
  }

  const anyBusy = busy !== null

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Hàng 1: thiết bị + hành động chính */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 py-1.5">
        <Button size="sm" className="gap-1.5" disabled={!serial || anyBusy} onClick={() => void scan()}>
          <UserCheck className={busy === 'scan' ? 'size-3.5 animate-spin' : 'size-3.5'} />
          {busy === 'scan' ? 'Đang quét…' : 'Quét acc trên máy'}
        </Button>
        <Button size="sm" variant="secondary" className="gap-1.5" disabled={!serial || anyBusy} onClick={() => void checkInCurrent()}>
          <Check className="size-3.5" /> Điểm danh acc đang mở
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5 border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          disabled={!serial || anyBusy}
          onClick={() => void runAll()}
          title="Tự chuyển acc rồi điểm danh lần lượt TẤT CẢ tài khoản có email"
        >
          {busy === 'all' ? <RefreshCw className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {busy === 'all' ? 'Đang chạy cả danh sách…' : 'Chạy tự động cả danh sách'}
        </Button>
        <Button
          size="sm"
          variant="tertiary"
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
          <Smartphone className="size-3.5" /> Dò lại thiết bị
        </Button>

        {device ? (
          <div className="flex items-center gap-2 rounded-[10px] border border-[var(--hairline)] px-2.5 py-1">
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
          Đã điểm danh: <b className="text-emerald-600">{doneCount}</b>/{rows.length} acc
        </span>
      </div>

      {snap?.error ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--hairline-soft)] bg-[#fdf2f2] px-3 py-1.5 text-[12.5px] text-[var(--error)]">
          <CircleAlert className="size-3.5 shrink-0" />
          <span>
            {snap.error}
            {snap.at ? ` · lần dò gần nhất: ${new Date(snap.at).toLocaleString('vi-VN')}` : ''}
          </span>
        </div>
      ) : null}

      {/* Hàng 2: trạng thái acc trên máy */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--hairline-soft)] bg-[var(--surface)]/50 px-3 py-2 text-[12.5px]">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--steel)]">Trên điện thoại</span>
        {signedIn?.email ? (
          <span className="flex items-center gap-1.5">
            đang đăng nhập:
            <b>{signedIn.name ?? signedIn.email}</b>
            <span className="mm-micro">{signedIn.email}</span>
            {byEmail.get(signedIn.email.toLowerCase()) ? (
              <Badge variant="success" className="gap-1">
                <Check className="size-3" /> khớp “{byEmail.get(signedIn.email.toLowerCase())!.profile.name}”
              </Badge>
            ) : (
              <Badge variant="warning">email chưa có trong danh sách</Badge>
            )}
          </span>
        ) : (
          <span className="text-[var(--stone)]">chưa quét — bấm “Quét acc trên máy”</span>
        )}
        {cached ? (
          <span className="text-[var(--steel)]">
            · máy có <b>{cached.length}</b> acc đã lưu (chuyển 1 tap, không cần mật khẩu)
          </span>
        ) : null}
      </div>

      {/* Bảng tài khoản */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow className="hover:bg-[var(--surface)]">
              <TableHead className="w-[54px]">Bước</TableHead>
              <TableHead className="w-[240px]">Tài khoản</TableHead>
              <TableHead className="w-[130px]">Có trên máy</TableHead>
              <TableHead className="w-[200px]">Trạng thái điểm danh</TableHead>
              <TableHead className="w-[130px]">Điểm</TableHead>
              <TableHead className="w-[180px]">Hành động</TableHead>
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
                const email = (r.profile.account ?? '').toLowerCase()
                const res = results[r.id]
                const onPhone = email ? cachedSet.has(email) : false
                const isOpen = !!email && signedIn?.email?.toLowerCase() === email
                return (
                  <TableRow key={r.id} className={isOpen ? 'bg-[var(--surface)]' : undefined}>
                    <TableCell>
                      <span className="mm-tabular text-[12.5px] text-[var(--stone)]">{i + 1}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">{r.profile.name}</span>
                        {isOpen ? <Badge variant="outline">đang mở</Badge> : null}
                      </div>
                      <div className="mm-micro truncate">{r.profile.account || '— chưa có email —'}</div>
                    </TableCell>
                    <TableCell>
                      {!cached ? (
                        <span className="text-[12px] text-[var(--stone)]">chưa quét</span>
                      ) : onPhone ? (
                        <Badge variant="success">có</Badge>
                      ) : (
                        <Badge variant="warning" className="gap-1">
                          <CircleAlert className="size-3" /> chưa có
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {!res ? (
                        <span className="text-[12.5px] text-[var(--stone)]">chưa chạy</span>
                      ) : !res.switched ? (
                        <span className="text-[12px] text-[var(--error)]">chuyển acc lỗi</span>
                      ) : !res.ok ? (
                        <span className="text-[12px] text-[var(--error)]">lỗi: {res.error?.slice(0, 50)}</span>
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
                    <TableCell className="mm-tabular">{res?.points ?? '—'}</TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="tertiary"
                        className="h-7 px-2.5 text-[11.5px]"
                        disabled={anyBusy || !email}
                        onClick={() => void switchAndCheckIn(r)}
                      >
                        {busy === r.id ? <RefreshCw className="size-3 animate-spin" /> : null}
                        Chuyển acc này &amp; điểm danh
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Log chạy tự động */}
      {log.length ? (
        <div className="max-h-[92px] shrink-0 overflow-auto border-t border-[var(--hairline-soft)] bg-[var(--canvas)] px-3 py-1.5 font-mono text-[11.5px] leading-relaxed text-[var(--steel)]">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ) : null}

      <div className="shrink-0 border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--steel)]">
        Bing app nhớ sẵn các acc đã đăng nhập trên máy ⇒ <b>chuyển acc chỉ 1 tap, không cần mật khẩu</b>. Acc nào báo
        “chưa có” thì vào Bing app → avatar → Cài đặt → <b>Thêm tài khoản</b> một lần, sau đó chạy tự động được.
      </div>
    </div>
  )
}
