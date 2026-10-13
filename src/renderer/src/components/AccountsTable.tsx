import {
  Check,
  Chrome,
  Download,
  Gift,
  Play,
  RefreshCw,
  Smartphone,
  Sparkles,
  Square,
  X
} from 'lucide-react'
import type { RowState } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { Progress } from '@renderer/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { fmtNum, pct, timeAgo } from '@renderer/lib/utils'

type Props = {
  rows: RowState[]
  selectedIds: string[]
  activeId: string | null
  busy: string | null
  refreshingId?: string | null
  onToggle: (id: string) => void
  onToggleAll: () => void
  onOpenDetail: (id: string) => void
  onOpenBrowser: (id: string) => void
  onCloseBrowser: (id: string) => void
  onRefresh: (id: string) => void
  onRun: (id: string, kinds: string[]) => void
  onStop: (id: string) => void
  /** id proxy -> tên gợi nhớ, để chip proxy hiển thị tên thay vì chuỗi dài */
  proxyLabels?: Record<string, string>
}

function MiniBar({
  progress,
  max,
  noData = false
}: {
  progress?: number | null
  max?: number | null
  noData?: boolean
}): React.JSX.Element {
  if (noData || (progress == null && max == null)) {
    return <span className="text-[var(--stone)] text-[13px]">—</span>
  }
  if (max === 0) {
    return <span className="text-[var(--stone)] text-[12px]">0/0 (chưa mở)</span>
  }
  if (max == null || max <= 0) {
    return <span className="text-[var(--stone)] text-[13px]">—</span>
  }
  const prog = progress ?? 0
  const p = pct(prog, max)
  return (
    <div className="flex items-center gap-1.5">
      <span className="mm-tabular w-[46px] text-[12.5px]">
        {prog}
        <span className="text-[var(--stone)]">/{max}</span>
      </span>
      <Progress value={p} className="h-1.5 w-[72px]" />
    </div>
  )
}

function StatusCell({ row }: { row: RowState }): React.JSX.Element {
  const c = row.cache
  const hasExtra = row.browser.running || row.run.running || row.needsRefresh
  const isSigned = !!c?.signedIn
  const hasData = !!c

  const signTitle = !hasData
    ? 'Chưa có dữ liệu trạng thái'
    : isSigned
      ? `Đã đăng nhập: ${row.profile.account || row.profile.name}`
      : `Chưa đăng nhập: ${row.profile.account || row.profile.name}`

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
      {hasExtra ? (
        // Khi có badge browser mở / đang chạy đi kèm: scale badge đăng nhập thành circle icon gọn gàng, fade-in, có tooltip
        <div
          title={signTitle}
          className={
            'group relative flex size-5.5 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all duration-200 cursor-help ' +
            (!hasData
              ? 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--stone)]'
              : isSigned
                ? 'border-[#b7eb8f] bg-[#f6ffed] text-[#389e0d]'
                : 'border-[#ffa39e] bg-[#fff1f0] text-[#cf1322]')
          }
        >
          {!hasData ? (
            <span className="animate-in fade-in zoom-in duration-200 text-[10px]">?</span>
          ) : isSigned ? (
            <Check className="size-3 animate-in fade-in zoom-in duration-200" strokeWidth={2.5} />
          ) : (
            <X className="size-3 animate-in fade-in zoom-in duration-200" strokeWidth={2.5} />
          )}
        </div>
      ) : (
        // Bình thường: hiển thị badge đầy đủ
        !c ? (
          <Badge variant="outline" className="whitespace-nowrap transition-all duration-200">
            chưa có dữ liệu
          </Badge>
        ) : c.signedIn ? (
          <Badge variant="success" className="whitespace-nowrap transition-all duration-200">
            đã đăng nhập
          </Badge>
        ) : (
          <Badge variant="destructive" className="whitespace-nowrap transition-all duration-200">
            chưa đăng nhập
          </Badge>
        )
      )}

      {row.browser.running ? (
        <Badge variant="beta" className="whitespace-nowrap shrink-0">
          browser mở
        </Badge>
      ) : null}
      {row.run.running ? (
        <Badge variant="coral" className="whitespace-nowrap shrink-0 animate-pulse">
          đang chạy
        </Badge>
      ) : null}
      {row.needsRefresh ? (
        <Badge variant="warning" className="whitespace-nowrap shrink-0">
          hôm qua
        </Badge>
      ) : null}
    </div>
  )
}

function cleanProxyDisplay(p: string): string {
  try {
    const s = p.replace(/^https?:\/\/|^socks5:\/\//i, '').split('@').pop() || p
    const parts = s.split(':')
    return parts[0] + ':' + parts[1]
  } catch {
    return p.slice(0, 20)
  }
}

/** Bảng quản lý tài khoản full-width; chi tiết mở ở drawer khi bấm vào dòng. */
export function AccountsTable(p: Props): React.JSX.Element {
  const allChecked = p.rows.length > 0 && p.selectedIds.length === p.rows.length

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
      <Table className="w-full min-w-[1470px] table-fixed">
        {/* colgroup: định hình độ rộng từng cột, bảng không nhảy cột khi dữ liệu đổi */}
        <colgroup>
          <col style={{ width: 40 }} />
          <col style={{ width: 260 }} />
          <col style={{ width: 170 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 75 }} />
          <col style={{ width: 150 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 65 }} />
          <col style={{ width: 110 }} />
          <col style={{ width: 85 }} />
          <col style={{ width: 95 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-[var(--surface)]">
            <TableHead>
              <Checkbox checked={allChecked} onCheckedChange={p.onToggleAll} aria-label="Chọn tất cả" />
            </TableHead>
            <TableHead>Tài khoản</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead className="text-right">Điểm</TableHead>
            <TableHead className="text-right">Hôm nay</TableHead>
            <TableHead>Search desktop</TableHead>
            <TableHead>Search mobile</TableHead>
            <TableHead title="Mục Keep earning trên trang /earn — tài khoản không có mục này sẽ hiện “không có”">
              Keep earning
            </TableHead>
            <TableHead className="text-right">Offers</TableHead>
            <TableHead>Daily set</TableHead>
            <TableHead className="text-center">Search đã chạy</TableHead>
            <TableHead className="text-center">Cập nhật</TableHead>
            <TableHead className="text-right pr-4">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={13} className="py-12 text-center text-[var(--steel)]">
                Chưa có tài khoản nào — bấm “Thêm tài khoản”.
              </TableCell>
            </TableRow>
          ) : (
            p.rows.map((row) => {
              const c = row.cache
              const hasData = row.hasData && c != null
              const dMax = c?.desktop?.max ?? row.profile.desktopMax ?? null
              const dProg = c ? (c.desktop?.progress ?? 0) : (dMax != null ? 0 : null)

              const mMax = c?.mobile?.max ?? row.profile.mobileMax ?? (dMax !== null && dMax <= 30 ? 0 : null)
              const mProg = c ? (c.mobile?.progress ?? 0) : (mMax != null ? 0 : null)

              const dailyMax = c?.dailySet?.max ?? (hasData ? 3 : null)
              const dailyProg = c?.dailySet?.progress ?? (hasData ? 0 : null)

              const searches =
                ((c?.runs.desktop as { searches?: number } | null)?.searches ?? 0) +
                ((c?.runs.mobile as { searches?: number } | null)?.searches ?? 0)
              const active = row.id === p.activeId
              return (
                <TableRow
                  key={row.id}
                  data-state={p.selectedIds.includes(row.id) ? 'selected' : undefined}
                  className={active ? 'bg-[var(--surface)]' : undefined}
                  onClick={() => p.onOpenDetail(row.id)}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={p.selectedIds.includes(row.id)}
                      onCheckedChange={() => p.onToggle(row.id)}
                      aria-label={`Chọn ${row.profile.name}`}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-medium text-[13.5px] leading-tight" title={row.profile.name}>
                        {row.profile.name}
                      </span>
                      {row.profile.proxyId || row.profile.proxy ? (
                        <span
                          className="max-w-[110px] shrink-0 truncate rounded bg-[var(--surface-soft)] px-1 text-[11px] font-medium text-[var(--brand-blue-deep)]"
                          title={
                            row.profile.proxyId
                              ? `proxy: ${p.proxyLabels?.[row.profile.proxyId] ?? row.profile.proxyId}`
                              : (row.profile.proxy ?? '')
                          }
                        >
                          🌐{' '}
                          {row.profile.proxyId
                            ? (p.proxyLabels?.[row.profile.proxyId] ?? 'proxy đã xoá')
                            : cleanProxyDisplay(row.profile.proxy ?? '')}
                        </span>
                      ) : null}
                    </div>
                    <div
                      className="mm-micro truncate"
                      title={`${row.profile.account || row.profile.id} · ${row.profile.channel === 'chrome' ? 'Chrome' : 'Edge'}${row.profile.cdpPort ? ` :${row.profile.cdpPort}` : ''}`}
                    >
                      {row.profile.account || row.profile.id}
                      <span className="text-[var(--stone)]">
                        {' · '}
                        {row.profile.channel === 'chrome' ? 'Chrome' : 'Edge'}
                        {row.profile.cdpPort ? ` :${row.profile.cdpPort}` : ''}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusCell row={row} />
                  </TableCell>
                  <TableCell className="mm-tabular text-right text-[15px] font-semibold">
                    {hasData ? fmtNum(c?.points) : '—'}
                    {c?.level ? <div className="mm-micro">{c.level}</div> : null}
                  </TableCell>
                  <TableCell className="mm-tabular text-right">
                    <span className="font-semibold text-[var(--success-text)]">
                      {hasData ? fmtNum(c?.todayPoints ?? 0) : '—'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <MiniBar progress={dProg} max={dMax} noData={!hasData && dMax == null} />
                  </TableCell>
                  <TableCell>
                    <MiniBar progress={mProg} max={mMax} noData={!hasData && mMax == null} />
                  </TableCell>
                  <TableCell>
                    {!hasData ? (
                      <span className="text-[13px] text-[var(--stone)]">—</span>
                    ) : c?.earn ? (
                      <MiniBar progress={c.earn.progress} max={c.earn.max} />
                    ) : (
                      <span className="text-[12px] text-[var(--stone)]">không có</span>
                    )}
                  </TableCell>
                  <TableCell className="mm-tabular text-right">{hasData ? fmtNum(c?.offers) : '—'}</TableCell>
                  <TableCell>
                    <MiniBar progress={dailyProg} max={dailyMax} noData={!hasData} />
                  </TableCell>
                  <TableCell className="mm-tabular text-center">{hasData ? searches : '—'}</TableCell>
                  <TableCell className="whitespace-nowrap text-center text-[12.5px] text-[var(--steel)]">
                    {hasData ? timeAgo(c?.cachedAt) : '—'}
                  </TableCell>
                  <TableCell className="text-right pr-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end items-center gap-1.5">
                      <Button
                        size="icon-sm"
                        variant="tertiary"
                        title={row.browser.running ? 'Đóng trình duyệt' : 'Mở trình duyệt (kèm CDP)'}
                        disabled={p.busy === `browser:${row.id}`}
                        onClick={() => (row.browser.running ? p.onCloseBrowser(row.id) : p.onOpenBrowser(row.id))}
                      >
                        {row.browser.running ? <X className="size-3.5" /> : <Chrome className="size-3.5" />}
                      </Button>
                      {(() => {
                        const isRefreshing = p.refreshingId === row.id || p.busy === `refresh:${row.id}`
                        return (
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Cập nhật trạng thái (mở trình duyệt đọc điểm)"
                            disabled={isRefreshing}
                            onClick={() => p.onRefresh(row.id)}
                          >
                            <RefreshCw className={isRefreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
                          </Button>
                        )
                      })()}
                      {row.run.running ? (
                        <Button
                          size="icon-sm"
                          variant="danger"
                          title="Dừng chạy tài khoản này"
                          onClick={(e) => {
                            e.stopPropagation()
                            p.onStop(row.id)
                          }}
                        >
                          <Square className="size-3.5 fill-current" />
                        </Button>
                      ) : (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="icon-sm"
                              variant="tertiary"
                              title="Chạy automation (bấm để chọn chức năng)"
                            >
                              <Play className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem
                              onClick={() => p.onRun(row.id, ['desktop', 'daily', 'earn', 'mobile'])}
                              className="gap-2"
                            >
                              <Play className="size-3.5" /> Chạy tất cả (Full)
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => p.onRun(row.id, ['desktop'])} className="gap-2">
                              <Download className="size-3.5" /> Chỉ Search desktop
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => p.onRun(row.id, ['mobile'])} className="gap-2">
                              <Smartphone className="size-3.5" /> Chỉ Search mobile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => p.onRun(row.id, ['daily'])} className="gap-2">
                              <Gift className="size-3.5" /> Chỉ Daily set
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => p.onRun(row.id, ['earn'])} className="gap-2">
                              <Sparkles className="size-3.5" /> Chỉ Kiếm thêm (Keep earning)
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* Dòng trạng thái đáy bảng: luôn thấy tổng quan dù bảng dài */}
      <div className="flex shrink-0 items-center justify-between border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--steel)]">
        <span>
          {p.rows.length} tài khoản · {p.rows.filter((r) => r.browser.running).length} trình duyệt mở ·{' '}
          {p.rows.filter((r) => r.run.running).length} đang chạy
        </span>
        <span>
          Tổng điểm đã lưu:{' '}
          <strong className="mm-tabular text-[var(--ink)]">
            {p.rows.reduce((s, r) => s + (r.cache?.points ?? 0), 0).toLocaleString('vi-VN')}
          </strong>{' '}
          · hôm nay:{' '}
          <strong className="mm-tabular text-[var(--success-text)]">
            {p.rows.reduce((s, r) => s + (r.cache?.todayPoints ?? 0), 0).toLocaleString('vi-VN')}
          </strong>
        </span>
      </div>
    </div>
  )
}
