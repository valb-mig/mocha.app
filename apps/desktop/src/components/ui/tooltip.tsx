import { Tooltip as T } from '@base-ui/react/tooltip'
import type { ReactElement, ReactNode } from 'react'
import { Kbd } from './kbd'

export const TooltipProvider = ({ children }: { children: ReactNode }) => (
  <T.Provider delay={450} closeDelay={0}>
    {children}
  </T.Provider>
)

export function Tip({
  label,
  shortcut,
  side = 'bottom',
  children,
}: {
  label: ReactNode
  shortcut?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  children: ReactElement
}) {
  return (
    <T.Root>
      <T.Trigger render={children} />
      <T.Portal>
        <T.Positioner side={side} sideOffset={6} className="z-[70]">
          <T.Popup className="flex origin-(--transform-origin) items-center gap-2 rounded-md border border-line-strong bg-raised px-2 py-1 text-[12px] text-soft shadow-lg shadow-black/30 transition-[opacity,transform] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {label}
            {shortcut && <Kbd>{shortcut}</Kbd>}
          </T.Popup>
        </T.Positioner>
      </T.Portal>
    </T.Root>
  )
}
