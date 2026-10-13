import {
  ChevronDown,
  Chrome,
  CircleSlash,
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
import { Badge } from '@renderer/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'

export type ToolbarProps = {
  selectedCount: number
  anyBrowserOpen: boolean
  anyRunning: boolean
  busy: string | null
  refreshing: { done: number; total: number } | null
  query: string
  onQuery: (v: string) => void
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
  const many = p.selectedCount > 1

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1.5">
      {/* 1. Nút Thêm tài khoản */}
      <Button size="sm" onClick={p.onAdd} className="gap-1.5">
        <Plus className="size-3.5" /> Thêm tài khoản
      </Button>

      <Divider />

      {/* 2. Cập nhật trạng thái */}
      <Button
        size="sm"
        variant="tertiary"
        disabled={none || !!p.refreshing}
        onClick={p.onRefreshPoints}
        className="gap-1.5"
        title="Mở trình duyệt để đọc điểm + trần ngày cho các tài khoản đã chọn"
      >
        <RefreshCw className={p.refreshing ? 'size-3.5 animate-spin' : 'size-3.5'} />
        {p.refreshing ? `Đang cập nhật ${p.refreshing.done}/${p.refreshing.total}` : 'Cập nhật trạng thái'}
      </Button>

      <Divider />

      {/* 3. Nhóm Chạy automation (Split Button / Dropdown) */}
      {p.anyRunning ? (
        <Button size="sm" variant="danger" onClick={p.onStop} className="gap-1.5">
          <Square className="size-3.5" /> Dừng chạy
        </Button>
      ) : (
        <div className="flex items-center">
          <Button
            size="sm"
            variant="secondary"
            disabled={none}
            onClick={() => p.onRun(['desktop', 'daily', 'earn', 'mobile'])}
            className="rounded-r-none border-r-0 gap-1.5"
          >
            <Play className="size-3.5" /> Chạy tất cả
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="secondary"
                disabled={none}
                className="rounded-l-none px-1.5"
                title="Tuỳ chọn chạy"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
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
      )}

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
              disabled={none && !p.anyBrowserOpen}
              className="rounded-l-none px-1.5"
              title="Thao tác trình duyệt"
            >
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem disabled={none} onClick={p.onOpenBrowser} className="gap-2">
              <Chrome className="size-3.5" /> Mở trình duyệt (kèm CDP)
            </DropdownMenuItem>
            <DropdownMenuItem disabled={p.selectedCount !== 1} onClick={p.onLoginWindow} className="gap-2">
              <LogIn className="size-3.5" /> Mở cửa sổ đăng nhập
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={!p.anyBrowserOpen}
              onClick={p.onCloseBrowser}
              className="gap-2 text-[var(--error)] focus:text-[var(--error)]"
            >
              <X className="size-3.5" /> Đóng trình duyệt đang mở
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
        <DropdownMenuContent align="start" className="w-48">
          <DropdownMenuItem disabled={p.selectedCount !== 1} onClick={p.onEdit} className="gap-2">
            <Pencil className="size-3.5" /> Sửa tài khoản
          </DropdownMenuItem>
          <DropdownMenuItem onClick={p.onReload} className="gap-2">
            <RefreshCw className="size-3.5" /> Nạp lại bảng
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

      {/* Phía bên phải: Badge chọn & Ô tìm kiếm */}
      <div className="ml-auto flex items-center gap-2">
        {p.selectedCount > 0 ? (
          <Badge variant="outline">{many ? `${p.selectedCount} tài khoản chọn` : '1 tài khoản chọn'}</Badge>
        ) : (
          <span className="hidden items-center gap-1.5 text-[12.5px] text-[var(--stone)] md:flex">
            <CircleSlash className="size-3.5" /> chưa chọn tài khoản
          </span>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--stone)]" />
          <Input
            value={p.query}
            onChange={(e) => p.onQuery(e.target.value)}
            placeholder="Tìm tài khoản…"
            className="h-8 w-[190px] pl-8"
          />
        </div>
      </div>
    </div>
  )
}
