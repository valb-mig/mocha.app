import { Dialog as D } from '@base-ui/react/dialog'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * Centralizado por flex e nao por translate: no WebKitGTK o transform
 * rasteriza o dialogo em pixel fracionario e borra o texto.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Backdrop className="fixed inset-0 z-50 bg-[#0b0807]/70 transition-opacity duration-150 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6">
          <D.Popup
            className={cn(
              'pointer-events-auto w-full max-w-md rounded-xl border border-line-strong bg-panel p-5 shadow-2xl shadow-black/50 outline-none transition-[opacity,transform] duration-150 ease-(--ease-out-soft) data-[ending-style]:translate-y-1 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-1 data-[starting-style]:opacity-0',
              className,
            )}
          >
            {title && <D.Title className="mb-4 font-serif text-[19px] font-medium text-fg">{title}</D.Title>}
            {children}
          </D.Popup>
        </div>
      </D.Portal>
    </D.Root>
  )
}
