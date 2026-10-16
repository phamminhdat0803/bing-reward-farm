import {
  Check,
  Chrome,
  Download,
  Gift,
  LogIn,
  Pencil,
  Play,
  RefreshCw,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  X,
  Clock,
  Loader2,
  MonitorCog,
  UserRound
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import type { RowState } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Checkbox } from '@renderer/components/ui/checkbox'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
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
import { RewardMetric } from './RewardsSummary'
import { BotScoreBadge } from './BotScore'

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
  /** proxyId -> suc khoe proxy (live / blocks-bing / dead) */
  proxyHealth?: Record<string, { status: string; ip?: string; country?: string; latency?: number; error?: string }>
  onEdit?: (id: string) => void
  onRemove?: (id: string) => void
  onSignOut?: (id: string) => void
  /** Menu chuột phải cho nhiều tài khoản đang chọn */
  onBulkRemove?: () => void
  onBulkRefresh?: () => void
}

function MiniBar({
  label,
  progress,
  max,
  noData = false
}: {
  label: string
  progress?: number | null
  max?: number | null
  noData?: boolean
}): React.JSX.Element {
  const available = !noData && max != null && max > 0
  const prog = progress ?? 0
  return (
    <div className="min-h-7 min-w-0" title={max === 0 ? `${label}: 0/0 (chưa mở)` : undefined}>
      <div className="flex min-w-0 items-center justify-between gap-1 text-[12px] leading-4">
        <span className="truncate text-[var(--steel)]">{label}</span>
        <span className="mm-tabular shrink-0">
          {available ? <>{prog}<span className="text-[var(--stone)]">/{max}</span></> :
            <span className="text-[var(--stone)]">{!noData && max === 0 ? 'Chưa mở' : '—'}</span>}
        </span>
      </div>
      {available ? <Progress value={pct(prog, max)} className="mt-1 h-1 w-full" /> : null}
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

  // Icon tròn + tooltip shadcn: dùng khi có từ 2 badge trở lên để cột Trạng thái không bị dài
  const dot = (opts: {
    key: string
    tip: string
    cls: string
    children: React.ReactNode
  }): React.JSX.Element => (
    <Tooltip key={opts.key}>
      <TooltipTrigger asChild>
        <div
          className={
            'flex size-5.5 shrink-0 cursor-help items-center justify-center rounded-full border transition-all duration-200 ' +
            opts.cls
          }
        >
          {opts.children}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{opts.tip}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="flex items-center gap-1.5 whitespace-nowrap overflow-hidden">
      {hasExtra ? (
        // Có badge phụ (browser mở / đang chạy / dữ liệu cũ): TẤT CẢ đều thu nhỏ thành icon tròn như badge đầu
        <>
          {dot({
            key: 'sign',
            tip: signTitle,
            cls: !hasData
              ? 'border-[var(--hairline)] bg-[var(--surface)] text-[var(--stone)]'
              : isSigned
                ? 'border-[#b7eb8f] bg-[#f6ffed] text-[#389e0d]'
                : 'border-[#ffa39e] bg-[#fff1f0] text-[#cf1322]',
            children: !hasData ? (
              <span className="animate-in fade-in zoom-in text-[10px] duration-200">?</span>
            ) : isSigned ? (
              <Check className="size-3 animate-in fade-in zoom-in duration-200" strokeWidth={2.5} />
            ) : (
              <X className="size-3 animate-in fade-in zoom-in duration-200" strokeWidth={2.5} />
            )
          })}
          {row.browser.running
            ? dot({
                key: 'browser',
                tip: `Trình duyệt đang mở${row.profile.cdpPort ? ` (CDP ${row.profile.cdpPort})` : ''}`,
                cls: 'border-[#91caff] bg-[#e6f4ff] text-[#0958d9]',
                children: <MonitorCog className="size-3 animate-in fade-in zoom-in duration-200" />
              })
            : null}
          {row.run.running
            ? dot({
                key: 'run',
                tip: 'Đang chạy automation cho tài khoản này',
                cls: 'border-[#ffbb96] bg-[#fff2e8] text-[#d4380d] animate-pulse',
                children: <Loader2 className="size-3 animate-spin" />
              })
            : null}
          {row.needsRefresh
            ? dot({
                key: 'stale',
                tip: 'Dữ liệu là của hôm qua — nên cập nhật trạng thái',
                cls: 'border-[#ffe58f] bg-[#fffbe6] text-[#d48806]',
                children: <Clock className="size-3 animate-in fade-in zoom-in duration-200" />
              })
            : null}
        </>
      ) : // Chỉ có 1 badge: giữ dạng chữ cho rõ nghĩa
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
      )}
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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[var(--canvas)]">
      <Table className="w-full table-fixed" horizontalScroll={false} data-slot="accounts-table">
        {/* Tổng 100%: mọi nhóm co giãn cùng cửa sổ, không cần cuộn ngang. */}
        <colgroup>
          <col style={{ width: '3%' }} />
          <col style={{ width: '25%' }} />
          <col style={{ width: '11%' }} />
          <col style={{ width: '15%' }} />
          <col style={{ width: '17%' }} />
          <col style={{ width: '9%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-[var(--surface)]">
            <TableHead>
              <Checkbox checked={allChecked} onCheckedChange={p.onToggleAll} aria-label="Chọn tất cả" />
            </TableHead>
            <TableHead>Tài khoản</TableHead>
            <TableHead className="text-right">Điểm</TableHead>
            <TableHead>Tìm kiếm</TableHead>
            <TableHead>Hoạt động</TableHead>
            <TableHead title="Số ngày liên tiếp, đọc từ trang Earn">Daily streak</TableHead>
            <TableHead title="Giá trị phần thưởng chờ nhận trên Dashboard">Ready to claim</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {p.rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="py-12 text-center text-[var(--steel)]">
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
              const multi = p.selectedIds.length > 1 && p.selectedIds.includes(row.id)
              return (
                <ContextMenu
                  key={row.id}
                  onOpenChange={(o) => {
                    // chuột phải vào dòng chưa chọn thì chọn luôn dòng đó
                    if (o && !p.selectedIds.includes(row.id)) p.onToggle(row.id)
                  }}
                >
                  <ContextMenuTrigger asChild>
                    <TableRow
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
                    <div data-slot="account-identity" className="flex min-w-0 items-start gap-2">
                      <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] text-[var(--steel)]" aria-hidden="true">
                        <UserRound className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate font-medium text-[13.5px] leading-tight" title={row.profile.name}>
                        {row.profile.name}
                      </span>
                    <div className="mm-micro truncate" title={row.profile.account || row.profile.id}>
                      {row.profile.account || row.profile.id}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="mm-micro shrink-0 whitespace-nowrap">
                        {row.profile.channel === 'coccoc' ? 'Cốc Cốc' : row.profile.channel === 'chrome' ? 'Chrome' : 'Edge'}
                        {row.profile.cdpPort ? ` :${row.profile.cdpPort}` : ''}
                      </span>
                      {row.profile.proxyId || row.profile.proxy ? (
                        (() => {
                          const h = row.profile.proxyId ? p.proxyHealth?.[row.profile.proxyId] : null
                          const color =
                            h?.status === 'live'
                              ? 'bg-[var(--success-text)]'
                              : h?.status === 'blocks-bing'
                                ? 'bg-[#b45309]'
                                : h?.status === 'dead'
                                  ? 'bg-[var(--error)]'
                                  : 'bg-[var(--stone)]'
                          const detail = h
                            ? `${h.status === 'live' ? 'OK' : h.status === 'blocks-bing' ? 'song nhung CHAN BING' : 'chet'}` +
                              `${h.ip ? ` · IP ${h.ip}` : ''}${h.country ? ` (${h.country})` : ''}` +
                              `${h.latency != null ? ` · ${h.latency}ms` : ''}${h.error ? ` · ${h.error}` : ''}`
                            : 'chua do suc khoe proxy'
                          return (
                            <span
                              className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-[var(--brand-blue-deep)]"
                              title={`proxy: ${row.profile.proxyId ? (p.proxyLabels?.[row.profile.proxyId] ?? row.profile.proxyId) : (row.profile.proxy ?? '')}\n${detail}`}
                            >
                              <span className={`size-1.5 shrink-0 rounded-full ${color}`} />
                              <span className="truncate">{row.profile.proxyId
                                ? (p.proxyLabels?.[row.profile.proxyId] ?? 'proxy đã xoá')
                                : cleanProxyDisplay(row.profile.proxy ?? '')}</span>
                            </span>
                          )
                        })()
                      ) : null}
                    </div>
                    <div className="flex min-h-6 flex-wrap items-center gap-1.5">
                      <StatusCell row={row} />
                      <BotScoreBadge data={c?.serpBotScore} />
                    </div>
                    </div>
                    </div>
                  </TableCell>
                  <TableCell className="mm-tabular text-right text-[15px] font-semibold">
                    {hasData ? fmtNum(c?.points) : '—'}
                    <div className="mt-1 whitespace-nowrap text-[12px] font-medium text-[var(--success-text)]">
                      {hasData ? `+${fmtNum(c?.todayPoints ?? 0)}` : '—'} <span className="font-normal text-[var(--steel)]">hôm nay</span>
                    </div>
                    {c?.level ? <div className="mm-micro">{c.level}</div> : null}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <MiniBar label="Desktop" progress={dProg} max={dMax} noData={!hasData && dMax == null} />
                      <MiniBar label="Mobile" progress={mProg} max={mMax} noData={!hasData && mMax == null} />
                    </div>
                    <div className="mm-micro mm-tabular mt-1">{hasData ? `${searches} lượt đã chạy` : 'Chưa có dữ liệu'}</div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <MiniBar label="Daily set" progress={dailyProg} max={dailyMax} noData={!hasData} />
                      <MiniBar label="Keep earning" progress={c?.earn?.progress} max={c?.earn?.max} noData={!hasData || !c?.earn} />
                    </div>
                    <div className="mm-micro mm-tabular mt-1 flex min-w-0 items-center gap-1.5">
                      <span>Offers: {hasData ? fmtNum(c?.offers) : '—'}</span>
                      {c?.earn?.blockedPoints ? (
                        <span
                          className="truncate text-[var(--error)]"
                          title={(c.earn.blocked ?? []).map(b => `${b.label}: ${b.reason}`).join('\n')}
                        >· Khoá {c.earn.blockedPoints}đ</span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <RewardMetric value={c?.dailyStreak} kind="streak" />
                  </TableCell>
                  <TableCell>
                    <RewardMetric value={c?.readyToClaim} kind="claim" />
                  </TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-1">
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
                        const isRefreshing =
                          p.refreshingId === row.id ||
                          p.busy === `refresh:${row.id}` ||
                          (p.busy === 'refresh' && p.refreshingId === row.id)
                        return (
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Cập nhật trạng thái (mở trình duyệt đọc điểm)"
                            disabled={isRefreshing || p.busy === 'refresh'}
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
                          <DropdownMenuContent align="end" className="min-w-[220px]" onClick={(e) => e.stopPropagation()}>
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
                    <div className="mm-micro mt-2 truncate" title={c?.cachedAt ? `Cập nhật ${new Date(c.cachedAt).toLocaleString('vi-VN')}` : 'Chưa cập nhật'}>
                      {hasData ? timeAgo(c?.cachedAt) : 'Chưa cập nhật'}
                    </div>
                  </TableCell>
                    </TableRow>
                  </ContextMenuTrigger>

                  <ContextMenuContent className="min-w-[250px]">
                    <ContextMenuLabel className="text-[12px] font-semibold text-[var(--steel)]">
                      {multi ? `${p.selectedIds.length} tài khoản đang chọn` : row.profile.name}
                    </ContextMenuLabel>
                    <ContextMenuSeparator />
                    <ContextMenuItem className="gap-2" onClick={() => p.onOpenDetail(row.id)}>
                      <Check className="size-3.5" /> Xem chi tiết
                    </ContextMenuItem>
                    {p.onEdit ? (
                      <ContextMenuItem className="gap-2" onClick={() => p.onEdit?.(row.id)}>
                        <Pencil className="size-3.5" /> Sửa tài khoản
                      </ContextMenuItem>
                    ) : null}
                    <ContextMenuSeparator />
                    {row.browser.running ? (
                      <ContextMenuItem className="gap-2" onClick={() => p.onCloseBrowser(row.id)}>
                        <X className="size-3.5" /> Đóng trình duyệt
                      </ContextMenuItem>
                    ) : (
                      <ContextMenuItem className="gap-2" onClick={() => p.onOpenBrowser(row.id)}>
                        <Chrome className="size-3.5" /> Mở trình duyệt (kèm CDP)
                      </ContextMenuItem>
                    )}
                    <ContextMenuItem className="gap-2" onClick={() => p.onRefresh(row.id)}>
                      <RefreshCw className="size-3.5" /> Cập nhật trạng thái
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    {row.run.running ? (
                      <ContextMenuItem className="gap-2 text-[var(--error)]" onClick={() => p.onStop(row.id)}>
                        <Square className="size-3.5" /> Dừng chạy
                      </ContextMenuItem>
                    ) : (
                      <>
                        <ContextMenuItem
                          className="gap-2"
                          onClick={() => (multi && p.onRun ? p.onRun(row.id, ['__all__']) : p.onRun(row.id, ['desktop', 'daily', 'earn', 'mobile']))}
                        >
                          <Play className="size-3.5" />
                          {multi ? `Chạy ${p.selectedIds.length} tài khoản (full)` : 'Chạy tất cả (full)'}
                        </ContextMenuItem>
                        <ContextMenuItem className="gap-2" onClick={() => p.onRun(row.id, ['desktop'])}>
                          <Download className="size-3.5" /> Chỉ Search desktop
                        </ContextMenuItem>
                        <ContextMenuItem className="gap-2" onClick={() => p.onRun(row.id, ['mobile'])}>
                          <Smartphone className="size-3.5" /> Chỉ Search mobile
                        </ContextMenuItem>
                        <ContextMenuItem className="gap-2" onClick={() => p.onRun(row.id, ['daily'])}>
                          <Gift className="size-3.5" /> Chỉ Daily set
                        </ContextMenuItem>
                        <ContextMenuItem className="gap-2" onClick={() => p.onRun(row.id, ['earn'])}>
                          <Sparkles className="size-3.5" /> Chỉ Kiếm thêm (Keep earning)
                        </ContextMenuItem>
                      </>
                    )}
                    {p.onSignOut ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem className="gap-2" onClick={() => p.onSignOut?.(row.id)}>
                          <LogIn className="size-3.5" /> Đăng xuất (xoá cookie)
                        </ContextMenuItem>
                      </>
                    ) : null}
                    {p.onRemove ? (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem
                          className="gap-2 text-[var(--error)]"
                          onClick={() => (multi && p.onBulkRemove ? p.onBulkRemove() : p.onRemove?.(row.id))}
                        >
                          <Trash2 className="size-3.5" />
                          {multi ? `Xoá ${p.selectedIds.length} tài khoản khỏi danh sách` : 'Xoá khỏi danh sách'}
                        </ContextMenuItem>
                      </>
                    ) : null}
                  </ContextMenuContent>
                </ContextMenu>
              )
            })
          )}
        </TableBody>
      </Table>

      {/* Dòng trạng thái đáy bảng: luôn thấy tổng quan dù bảng dài */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 py-1.5 text-[12px] text-[var(--steel)]">
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
