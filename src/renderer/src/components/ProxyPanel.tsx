import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, RefreshCw, Trash2, Wifi } from 'lucide-react'
import { Badge } from '@renderer/components/ui/badge'
import { Button } from '@renderer/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@renderer/components/ui/table'
import { ProxyDialog } from '@renderer/components/ProxyDialog'
import { timeAgo } from '@renderer/lib/utils'
import type { ProxyItem, RowState } from '@shared/types'

/** Tab "Proxy": kho proxy dùng chung, test trực tiếp, biết tài khoản nào đang gắn. */
export function ProxyPanel({ rows, onChanged }: { rows: RowState[]; onChanged: () => void }): React.JSX.Element {
  const [items, setItems] = useState<ProxyItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProxyItem | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const reload = async (): Promise<void> => setItems(await window.api.listProxies())

  useEffect(() => {
    void reload()
    const t = window.setInterval(() => void reload(), 30000)
    return () => window.clearInterval(t)
  }, [])

  const usersOf = (id: string): RowState[] => rows.filter((r) => r.profile.proxyId === id)

  const act = async (key: string, fn: () => Promise<void>): Promise<void> => {
    setBusy(key)
    try {
      await fn()
    } catch (e) {
      toast.error(String((e as Error).message).slice(0, 200))
    } finally {
      setBusy(null)
    }
  }

  const testOne = (id: string): Promise<void> =>
    act(`test:${id}`, async () => {
      const r = await window.api.testSavedProxy(id)
      if (r.ok) toast.success(`Proxy OK — IP ${r.ip}${r.country ? ` (${r.country})` : ''} · ${r.latency}ms`)
      else toast.error(`Proxy lỗi: ${r.error}`)
      await reload()
    })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5 rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)] px-2.5 py-1.5">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus className="size-3.5" /> Thêm proxy
        </Button>
        <span className="mx-1 h-5 w-px bg-[var(--hairline)]" />
        <Button
          size="sm"
          variant="tertiary"
          className="gap-1.5"
          disabled={!items.length || busy === 'all'}
          onClick={() =>
            void act('all', async () => {
              toast.info(`Đang kiểm tra ${items.length} proxy…`)
              const res = await window.api.testAllProxies()
              const ok = Object.values(res).filter((r) => r.ok).length
              toast.success(`Xong: ${ok}/${items.length} proxy hoạt động`)
              await reload()
            })
          }
        >
          <Wifi className={busy === 'all' ? 'size-3.5 animate-pulse' : 'size-3.5'} /> Kiểm tra tất cả
        </Button>
        <Button size="sm" variant="tertiary" className="gap-1.5" onClick={() => void reload()}>
          <RefreshCw className="size-3.5" /> Nạp lại
        </Button>
        <span className="ml-auto text-[12.5px] text-[var(--stone)]">
          {items.length} proxy · {rows.filter((r) => r.profile.proxyId).length} tài khoản đã gắn
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[12px] border border-[var(--hairline)] bg-[var(--canvas)]">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table className="min-w-[1000px]">
            <colgroup>
              <col style={{ width: 170 }} />
              <col style={{ width: 300 }} />
              <col style={{ width: 260 }} />
              <col style={{ width: 240 }} />
              <col style={{ width: 190 }} />
            </colgroup>
            <TableHeader>
              <TableRow className="hover:bg-[var(--surface)]">
                <TableHead>Tên</TableHead>
                <TableHead>Chuỗi proxy</TableHead>
                <TableHead>Kết quả test gần nhất</TableHead>
                <TableHead>Tài khoản đang dùng</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-12 text-center text-[var(--steel)]">
                    Chưa có proxy nào — bấm “Thêm proxy” rồi gán cho tài khoản ở tab Tài khoản.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((p) => {
                  const users = usersOf(p.id)
                  const t = p.lastTest
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="truncate font-medium">{p.label}</div>
                        {p.note ? <div className="mm-micro truncate">{p.note}</div> : null}
                      </TableCell>
                      <TableCell>
                        <code className="break-all text-[11.5px] text-[var(--steel)]">{p.url}</code>
                      </TableCell>
                      <TableCell>
                        {!t ? (
                          <span className="text-[12.5px] text-[var(--stone)]">chưa test</span>
                        ) : t.ok ? (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="success">OK</Badge>
                            <span className="mm-tabular text-[12.5px]">{t.ip}</span>
                            {t.country ? (
                              <span className="text-[12px] text-[var(--steel)]">
                                {t.country}
                                {t.city ? `, ${t.city}` : ''}
                              </span>
                            ) : null}
                            {t.latency ? <span className="mm-micro">{t.latency}ms</span> : null}
                            <span className="mm-micro">· {timeAgo(t.at)}</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge variant="destructive">LỖI</Badge>
                            <span className="text-[12px] text-[var(--error)]">{t.error}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {users.length === 0 ? (
                          <span className="text-[12.5px] text-[var(--stone)]">chưa gắn</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {users.map((u) => (
                              <Badge key={u.id} variant="outline">
                                {u.profile.name}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Kiểm tra proxy này"
                            disabled={busy === `test:${p.id}`}
                            onClick={() => void testOne(p.id)}
                          >
                            <Wifi className={busy === `test:${p.id}` ? 'size-3.5 animate-pulse' : 'size-3.5'} />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Sửa proxy"
                            onClick={() => {
                              setEditing(p)
                              setDialogOpen(true)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="tertiary"
                            title="Xoá proxy khỏi kho"
                            className="text-[var(--error)]"
                            onClick={() =>
                              void act(`del:${p.id}`, async () => {
                                if (users.length) {
                                  toast.error(
                                    `Đang có ${users.length} tài khoản dùng proxy này — đổi proxy cho các acc đó trước.`
                                  )
                                  return
                                }
                                const r = await window.api.removeProxy(p.id)
                                if (!r.ok) throw new Error(r.error)
                                toast.success('Đã xoá proxy khỏi kho.')
                                await reload()
                                onChanged()
                              })
                            }
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProxyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initial={editing}
        onSubmit={async (patch) => {
          if (editing) {
            const r = await window.api.updateProxy(editing.id, patch)
            if (!r.ok) throw new Error(r.error)
            toast.success('Đã lưu proxy.')
          } else {
            const r = await window.api.addProxy(patch)
            if (!r.ok) throw new Error(r.error)
            toast.success('Đã thêm proxy vào kho.')
          }
          await reload()
          onChanged()
        }}
      />
    </div>
  )
}
