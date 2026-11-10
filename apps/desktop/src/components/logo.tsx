import { cn } from '@/lib/cn'

export const CupGlyph = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 32 32" className={className} aria-hidden>
    <path d="M5 11h17v6.5a8.5 8.5 0 0 1-17 0z" fill="currentColor" />
    <path d="M22 13h1.6a3.4 3.4 0 0 1 0 6.8H21.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    <ellipse cx="13.5" cy="11" rx="8.5" ry="1.9" fill="var(--color-accent)" />
    <rect x="4" y="27.5" width="19" height="1.6" rx=".8" fill="var(--color-line-strong)" />
  </svg>
)

export const Logo = ({ className }: { className?: string }) => (
  <div className={cn('flex items-center gap-2 text-fg', className)}>
    <CupGlyph className="size-6 text-soft" />
    <span className="font-serif text-[19px] font-semibold tracking-[-0.02em]">mocha</span>
  </div>
)
