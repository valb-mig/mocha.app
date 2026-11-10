import { ContextMenu as CM } from '@base-ui/react/context-menu'
import { Menu as M } from '@base-ui/react/menu'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '@/lib/cn'

const popup =
  'min-w-44 origin-(--transform-origin) rounded-lg border border-line-strong bg-raised p-1 shadow-xl shadow-black/40 outline-none transition-[opacity,transform] duration-100 data-[ending-style]:scale-[0.97] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.97] data-[starting-style]:opacity-0'

const item =
  'flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] text-soft outline-none select-none data-[highlighted]:bg-hover data-[highlighted]:text-fg [&_svg]:size-4 [&_svg]:text-muted data-[highlighted]:[&_svg]:text-fg'

export function Menu({
  trigger,
  children,
  align = 'start',
  side = 'bottom',
}: {
  trigger: ReactElement
  children: ReactNode
  align?: 'start' | 'center' | 'end'
  side?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <M.Root>
      <M.Trigger render={trigger} />
      <M.Portal>
        <M.Positioner side={side} align={align} sideOffset={6} className="z-[60] outline-none">
          <M.Popup className={popup}>{children}</M.Popup>
        </M.Positioner>
      </M.Portal>
    </M.Root>
  )
}

export function ContextMenu({ children, menu }: { children: ReactElement; menu: ReactNode }) {
  return (
    <CM.Root>
      <CM.Trigger render={children} />
      <CM.Portal>
        <CM.Positioner className="z-[60] outline-none">
          <CM.Popup className={popup}>{menu}</CM.Popup>
        </CM.Positioner>
      </CM.Portal>
    </CM.Root>
  )
}

export function MenuItem({
  icon,
  children,
  onSelect,
  danger,
}: {
  icon?: ReactNode
  children: ReactNode
  onSelect: () => void
  danger?: boolean
}) {
  return (
    <M.Item
      onClick={onSelect}
      className={cn(item, danger && 'text-danger data-[highlighted]:text-danger [&_svg]:text-danger/80')}
    >
      {icon}
      {children}
    </M.Item>
  )
}

export const MenuSeparator = () => <div className="mx-1 my-1 h-px bg-line" />
