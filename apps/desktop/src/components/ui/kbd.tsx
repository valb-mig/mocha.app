import type { ReactNode } from 'react'

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded-[4px] border border-line-strong bg-panel px-1 font-mono text-[10.5px] leading-4 text-muted">
    {children}
  </kbd>
)
