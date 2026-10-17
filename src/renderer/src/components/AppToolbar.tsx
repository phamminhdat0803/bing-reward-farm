import { ProxyAutoFillButton } from './ProxyAutoFillButton'
import { toast } from 'sonner'
import {
  FileText,
  ChevronDown,
  Chrome,
  Download,
  Gift,
  LogIn,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Smartphone,
  Sparkles,
  Square,
  Trash2,
  X
} from 'lucide-react'
import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/scroll-area'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

export type ToolbarProps = {
  selectedCount: number
  runningCount: number
  selectedBrowserCount: number
  selectedRunningCount: number
  hiddenSelectedCount: number
  busy: string | null
  refreshing: { done: number; total: number; parallel?: number } | null
  query: string
  onQuery: (v: string) => void
  onClearSelection: () => void
  onAdd: () => void
  onEdit: () => void
  onRemove: () => void
  onOpenBrowser: () => void
  onCloseBrowser: () => void
  onLoginWindow: () => void
  onRun: (kinds: string[]) => void
  onStop: () => void
  onRefreshPoints: () => void
  onReload: () => void
}

function Divider(): React.JSX.Element {
  return <span className="mx-1 h-5 w-px bg-[var(--hairline)]" />
}

/** Thanh menu phía trên bảng kiểu GPMLogin — gọn gàng, nhóm menu xổ xuống */
export function AppToolbar(p: ToolbarProps): React.JSX.Element {
  const none = p.selectedCount === 0
  const isRefreshing = !!p.refreshing && (p.refreshing.total === 0 || p.refreshing.done < p.refreshing.total)
  const stopCount = none ? p.runningCount : p.selectedRunningCount

  return (
    <div data-slot="account-toolbar" className="shrink-0 border-b border-[var(--hairline-soft)] bg-[var(--canvas)]">
      <div className="flex min-w-0 items-center">
      <ScrollArea className="h-11 min-w-0 flex-1">
      <div className="flex h-11 min-w-max items-center gap-1.5 px-3">
      {/* 1. Nút Thêm tài khoản */}
      <Button size="sm" onClick={p.onAdd} className="gap-1.5">
        <Plus className="size-3.5" /> Thêm tài khoản
      </Button>

      <ProxyAutoFillButton onChanged={p.onReload} />
      <Divider />

      {/* 2. Cập nhật trạng thái */}
      <Button
        size="sm"
        variant="tertiary"
        disabled={none || isRefreshing}
        onClick={p.onRefreshPoints}
        className="w-[175px] gap-1.5"
        title="Mở trình duyệt để đọc điểm + trần ngày cho các tài khoản đã chọn"
      >
        <RefreshCw className={isRefreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
        <span className="truncate">{isRefreshing
          ? `Đang cập nhật ${p.refreshing?.done ?? 0}/${p.refreshing?.total ?? 0}${(p.refreshing?.parallel ?? 1) > 1 ? ` · ${p.refreshing?.parallel} song song` : ''}`
          : 'Cập nhật trạng thái'}</span>
      </Button>

      <Divider />

      {/* 3. Nhóm Chạy automation (Split Button / Dropdown) - Luôn hiển thị để có thể chạy tài khoản khác */}
      <div className="flex items-center">
        <Button
          size="sm"
          variant="secondary"
          disabled={none}
          onClick={() => p.onRun(['desktop', 'daily', 'earn', 'mobile'])}
          className="rounded-r-none border-r-0 gap-1.5"
        >
          <Play className="size-3.5" /> Chạy đã chọn
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="secondary"
              disabled={none}
              className="rounded-l-none px-1.5"
              title="Tuỳ chọn chức năng chạy"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <DropdownMenuItem onClick={() => p.onRun(['desktop', 'daily', 'earn', 'mobile'])} className="gap-2">
              <Play className="size-3.5" /> Chạy tất cả (Full)
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => p.onRun(['desktop'])} className="gap-2">
              <Download className="size-3.5" /> Chỉ Search desktop
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => p.onRun(['mobile'])} className="gap-2">
              <Smartphone className="size-3.5" /> Chỉ Search mobile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => p.onRun(['daily'])} className="gap-2">
              <Gift className="size-3.5" /> Chỉ Daily set
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => p.onRun(['earn'])} className="gap-2">
              <Sparkles className="size-3.5" /> Chỉ Kiếm thêm (Keep earning)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Keep the stop control in place; its label makes the target explicit. */}
        <Button size="sm" variant="danger" disabled={!stopCount} onClick={p.onStop} className="mm-tabular w-[145px] gap-1.5">
          <Square className="size-3.5 fill-current" /> {none ? 'Dừng tất cả' : 'Dừng đã chọn'}{stopCount > 0 ? ` (${stopCount})` : ''}
        </Button>

      <Divider />

      {/* 4. Nhóm Trình duyệt (Split Button / Dropdown) */}
      <div className="flex items-center">
        <Button
          size="sm"
          variant="tertiary"
          disabled={none}
          onClick={p.onOpenBrowser}
          className="rounded-r-none border-r-0 gap-1.5"
        >
          <Chrome className="size-3.5" /> Mở trình duyệt
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="tertiary"
              disabled={none}
              className="rounded-l-none px-1.5"
              title="Thao tác trình duyệt"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[240px]">
            <DropdownMenuItem disabled={none} onClick={p.onOpenBrowser} className="gap-2.5 whitespace-nowrap">
              <Chrome className="size-3.5" />
              <span>Mở trình duyệt</span>
              <span className="ml-auto text-[11px] text-[var(--stone)]">(kèm CDP)</span>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={p.selectedCount !== 1} onClick={p.onLoginWindow} className="gap-2.5 whitespace-nowrap">
              <LogIn className="size-3.5" /> Mở cửa sổ đăng nhập
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!p.selectedBrowserCount}
              onClick={p.onCloseBrowser}
              className="gap-2.5 whitespace-nowrap text-[var(--error)] focus:text-[var(--error)]"
            >
              <X className="size-3.5" /> Đóng trình duyệt đã chọn
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 5. Menu Khác (Sửa, Nạp lại, Xoá) */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="tertiary" className="gap-1.5">
            <MoreHorizontal className="size-3.5" /> Thao tác khác <ChevronDown className="size-3 text-[var(--stone)]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[200px]">
          <DropdownMenuItem disabled={p.selectedCount !== 1} onClick={p.onEdit} className="gap-2">
            <Pencil className="size-3.5" /> Sửa tài khoản
          </DropdownMenuItem>
          <DropdownMenuItem onClick={p.onReload} className="gap-2">
            <RefreshCw className="size-3.5" /> Nạp lại bảng
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            title="Xuất log tài khoản (số liệu, tiến độ, proxy, lịch sử, hồ sơ, log thô) ra file .log"
            onClick={() => {
              void (async () => {
                const text = await window.api.exportAccountsLog()
                const r = await window.api.exportSave({
                  name: `reward-farm-log-${new Date().toISOString().slice(0, 10)}.log`,
                  content: text,
                  ext: 'txt'
                })
                if (r.ok) toast.success(`Đã lưu log tài khoản: ${r.path}`)
                else if (!r.canceled) toast.error(r.error ?? 'không lưu được file')
              })()
            }}
          >
            <FileText className="size-3.5" /> Xuất log tài khoản (.log)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            disabled={none}
            onClick={p.onRemove}
            className="gap-2 text-[var(--error)] focus:text-[var(--error)]"
          >
            <Trash2 className="size-3.5" /> Xoá tài khoản đã chọn
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      </div>
      <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <div className="shrink-0 border-l border-[var(--hairline-soft)] px-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--stone)]" />
          <Input
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder="Tìm tài khoản…"
            aria-label="Tìm tài khoản"
            className="h-8 w-[190px] pl-8"
          />
        </div>
      </div>
      </div>
      <div className="flex h-8 items-center gap-3 border-t border-[var(--hairline-soft)] bg-[var(--surface)] px-3 text-[12px] text-[var(--steel)]">
        <div className="flex w-[360px] max-w-[55%] shrink-0 items-center gap-2">
        <span aria-live="polite" className="mm-tabular min-w-0 flex-1 truncate">
          {none ? 'Chưa chọn tài khoản' : `Đã chọn ${p.selectedCount} tài khoản`}
          {p.hiddenSelectedCount > 0 ? ` · ${p.hiddenSelectedCount} đang ẩn bởi bộ lọc` : ''}
        </span>
        <Button size="sm" variant="ghost" disabled={none} onClick={p.onClearSelection} className="h-6 px-2 text-[11px]">Bỏ chọn</Button>
        </div>
        <span className="ml-auto truncate text-[11px] text-[var(--stone)]">Bấm dòng để chọn · Ctrl/⌘ hoặc checkbox để chọn nhiều · Shift chọn đoạn · Bấm tên / nhấp đúp để xem</span>
      </div>
    </div>
  )
}
