import { cn } from '@/lib/cn'

/** Pulsa em opacidade, sem brilho correndo por cima. */
export const Skeleton = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <div className={cn('animate-breathe rounded-md bg-raised', className)} style={style} />
)
