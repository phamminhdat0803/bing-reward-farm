import { useEffect, useState } from 'react'
import { Info, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react'
import type { DetectedBrowser } from '@shared/types'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'

/** Liệt kê trình duyệt đang cài trên máy để chọn cho từng tài khoản. */
export function BrowsersDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
}): React.JSX.Element {
  const [list, setList] = useState<DetectedBrowser[]>([])
  const [loading, setLoading] = useState(false)

  const load = async (force = false): Promise<void> => {
    setLoading(true)
    try {
      setList(await window.api.detectBrowsers(force))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) void load()
  }, [open])

  const chromium = list.filter((b) => b.chromium)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle className="text-[24px]">Trình duyệt trên máy</DialogTitle>
          <DialogDescription>
            Tìm thấy <strong>{list.length}</strong> trình duyệt — trong đó <strong>{chromium.length}</strong> dùng được
            cho automation (nhân Chromium: hỗ trợ <code>--user-data-dir</code> + CDP).
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[420px] overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 bg-[var(--surface)]">
              <tr>
                <th className="px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-[var(--steel)]">Trình duyệt</th>
                <th className="px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-[var(--steel)]">Phiên bản</th>
                <th className="px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-[var(--steel)]">Đường dẫn</th>
                <th className="px-2.5 py-1.5 text-left text-[12.5px] font-semibold text-[var(--steel)]">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-[var(--steel)]">
                    {loading ? 'Đang dò…' : 'Không tìm thấy trình duyệt nào.'}
                  </td>
                </tr>
              ) : (
                list.map((b) => (
                  <tr key={b.exe} className="border-b border-[var(--hairline-soft)]">
                    <td className="px-2.5 py-1.5">
                      <div className="font-medium">{b.name}</div>
                      <div className="mm-micro">{b.id}</div>
                    </td>
                    <td className="mm-tabular px-2.5 py-1.5">{b.version ?? '—'}</td>
                    <td className="px-2.5 py-1.5">
                      <code className="break-all text-[11.5px] text-[var(--steel)]">{b.exe}</code>
                    </td>
                    <td className="px-2.5 py-1.5">
                      {!b.chromium ? (
                        <Badge variant="outline">
                          <Info className="size-3" /> không hỗ trợ
                        </Badge>
                      ) : b.autoSignInRisk ? (
                        <Badge variant="warning">
                          <ShieldAlert className="size-3" /> Windows tự gắn tài khoản
                        </Badge>
                      ) : (
                        <Badge variant="success">
                          <ShieldCheck className="size-3" /> dùng tốt cho acc phụ
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-[10px] border border-[var(--hairline)] bg-[var(--surface)] px-3 py-2 text-[12.5px] text-[var(--steel)]">
          <strong className="text-[var(--ink)]">Cách dùng:</strong> mở <em>Sửa</em> tài khoản → chọn trình duyệt. Tài
          khoản chính nên để <strong>Edge</strong> (có bonus Edge); tài khoản phụ nên dùng{' '}
          <strong>Chrome / Brave / Cốc Cốc</strong> để không bị Windows tự đăng nhập nhầm tài khoản Microsoft.
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="tertiary" className="gap-1.5" onClick={() => void load(true)} disabled={loading}>
            <RefreshCw className={loading ? 'size-3.5 animate-spin' : 'size-3.5'} /> Dò lại
          </Button>
          <Button onClick={() => onOpenChange(false)}>Đóng</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
