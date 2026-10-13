import { Button } from '@renderer/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@renderer/components/ui/dialog'

export type ConfirmRequest = {
  title: string
  description: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
}

/** Hop xac nhan trong app (thay window.confirm — tranh modal native cua Electron chiem focus). */
export function ConfirmDialog({
  request,
  onClose
}: {
  request: ConfirmRequest | null
  onClose: () => void
}): React.JSX.Element {
  return (
    <Dialog open={!!request} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="z-[70] sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[20px]">{request?.title ?? ''}</DialogTitle>
          <DialogDescription className="whitespace-pre-line">{request?.description ?? ''}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="tertiary" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            variant={request?.danger ? 'danger' : 'default'}
            onClick={() => {
              void request?.onConfirm()
              onClose()
            }}
          >
            {request?.confirmLabel ?? 'Xác nhận'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
