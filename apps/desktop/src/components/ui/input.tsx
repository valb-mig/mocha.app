import { forwardRef, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      spellCheck={false}
      className={cn(
        'h-9 w-full rounded-md border border-line bg-bg px-3 text-[13.5px] text-fg outline-none transition-colors placeholder:text-faint focus:border-accent/70',
        className,
      )}
      {...props}
    />
  )
})
