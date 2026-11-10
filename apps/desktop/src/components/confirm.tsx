import type { ReactNode } from 'react'
import { Button } from './ui/button'
import { Dialog } from './ui/dialog'

export function Confirm({
  open,
  onOpenChange,
  title,
  children,
  action,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  children?: ReactNode
  action: string
  onConfirm: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} className="max-w-sm">
      {children && <div className="mb-5 text-muted">{children}</div>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
        <Button
          variant="danger"
          autoFocus
          onClick={() => {
            onConfirm()
            onOpenChange(false)
          }}
        >
          {action}
        </Button>
      </div>
    </Dialog>
  )
}
