import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

const variants = {
  primary: 'bg-accent text-accent-fg hover:bg-accent-strong font-medium',
  secondary: 'bg-raised text-fg border border-line hover:bg-hover hover:border-line-strong',
  ghost: 'text-muted hover:text-fg hover:bg-hover',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}

const sizes = {
  sm: 'h-7 px-2.5 gap-1.5 text-[12.5px] [&_svg]:size-3.5',
  md: 'h-8 px-3 gap-2 [&_svg]:size-4',
  lg: 'h-10 px-4 gap-2 text-[14px] [&_svg]:size-4',
  icon: 'size-7 [&_svg]:size-4',
  'icon-sm': 'size-6 [&_svg]:size-3.5',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', className, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md whitespace-nowrap transition-[background,color,border-color,transform] duration-150 select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  )
})
