import { useEffect } from 'react'
import { ArrowLeft, FolderOpen, Maximize2, Minimize2, Scan, Square } from 'lucide-react'
import { motion } from 'motion/react'
import { FramePreview } from '@/components/frame-preview'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/tooltip'
import { backend } from '@/lib/backend'
import { cn } from '@/lib/cn'
import type { BlendTab, OpenBlend } from '@/lib/nav'
import { useBlendTick, useBlends } from '@/lib/vault'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { AssetsTab, FontsTab, NotesTab, PaletteTab, TokensTab } from './blend-tabs'

const TABS: { id: BlendTab; label: string }[] = [
  { id: 'screens', label: 'Telas' },
  { id: 'palette', label: 'Paleta' },
  { id: 'fonts', label: 'Fontes' },
  { id: 'tokens', label: 'Tokens' },
  { id: 'assets', label: 'Assets' },
  { id: 'notes', label: 'Notas' },
]

/** Encaixar (escala a tela de 1440px para caber) ou 1:1. Vale para o app todo. */
const useZoom = create<{ fit: boolean; toggle(): void }>()(
  persist((set) => ({ fit: true, toggle: () => set((s) => ({ fit: !s.fit })) }), { name: 'mocha:zoom' }),
)

export function BlendViewer({
  slug,
  open,
  expanded,
  onChange,
  onClose,
  onToggleExpand,
}: {
  slug: string
  open: OpenBlend
  expanded: boolean
  onChange: (open: OpenBlend) => void
  onClose: () => void
  onToggleExpand: () => void
}) {
  const { data: blends, isPending } = useBlends(slug)
  const blend = blends?.find((b) => b.version === open.version) ?? blends?.[0]
  const screen = blend?.screens.find((s) => s.file === open.screen) ?? blend?.screens[0]
  const tick = useBlendTick(slug, blend?.version ?? 0)
  const { fit, toggle } = useZoom()

  useEffect(() => {
    if (blends && !blends.length) onClose()
  }, [blends, onClose])

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-line pr-2 pl-1.5">
        {!expanded && (
          <Tip label="Blends">
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="Voltar">
              <ArrowLeft />
            </Button>
          </Tip>
        )}
        <div className={cn('flex items-center gap-0.5 rounded-md bg-bg p-0.5', expanded && 'ml-1.5')}>
          {(blends ?? [])
            .slice()
            .reverse()
            .map((b) => (
              <button
                key={b.version}
                onClick={() => onChange({ ...open, version: b.version, screen: open.screen })}
                className={cn(
                  'h-6 rounded-[5px] px-2 font-mono text-[11.5px] transition-colors',
                  b.version === blend?.version ? 'bg-hover text-accent-strong' : 'text-faint hover:text-soft',
                )}
              >
                v{b.version}
              </button>
            ))}
        </div>
        <nav className="ml-2 flex h-full items-center">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onChange({ ...open, tab: t.id })}
              className={cn(
                'relative flex h-full items-center px-2.5 text-[12.5px] transition-colors',
                open.tab === t.id ? 'text-fg' : 'text-faint hover:text-soft',
              )}
            >
              {t.label}
              {open.tab === t.id && (
                <motion.span
                  layoutId={`tab-${expanded ? 'x' : 's'}`}
                  className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-accent"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        {open.tab === 'screens' && (
          <Tip label={fit ? 'Tamanho real' : 'Encaixar'}>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Zoom">
              {fit ? <Square /> : <Scan />}
            </Button>
          </Tip>
        )}
        {blend && (
          <Tip label="Abrir pasta">
            <Button variant="ghost" size="icon" onClick={() => backend.reveal(blend.path)} aria-label="Abrir pasta">
              <FolderOpen />
            </Button>
          </Tip>
        )}
        <Tip label={expanded ? 'Recolher' : 'Expandir'} shortcut={expanded ? 'Esc' : undefined}>
          <Button variant="ghost" size="icon" onClick={onToggleExpand} aria-label="Expandir">
            {expanded ? <Minimize2 /> : <Maximize2 />}
          </Button>
        </Tip>
      </div>

      {isPending || !blend ? (
        <div className="flex-1 p-3">
          <Skeleton className="h-full w-full rounded-lg" />
        </div>
      ) : (
        <div key={`${blend.version}-${open.tab}`} className="flex min-h-0 flex-1 flex-col">
          {open.tab === 'screens' && (
            <>
              {blend.screens.length > 1 && (
                <div className="flex shrink-0 gap-1 overflow-x-auto px-3 pt-3">
                  {blend.screens.map((s) => (
                    <button
                      key={s.file}
                      onClick={() => onChange({ ...open, screen: s.file })}
                      className={cn(
                        'h-7 shrink-0 rounded-md border px-2.5 text-[12px] transition-colors',
                        s.file === screen?.file
                          ? 'border-line-strong bg-hover text-fg'
                          : 'border-transparent text-muted hover:bg-raised hover:text-soft',
                      )}
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              )}
              <div className="min-h-0 flex-1 p-3">
                {screen ? (
                  <div className="h-full overflow-hidden rounded-lg border border-line bg-bg">
                    <FramePreview
                      key={fit ? 'fit' : 'actual'}
                      path={screen.path}
                      title={screen.title}
                      tick={tick}
                      mode={fit ? 'fit' : 'actual'}
                      className="h-full w-full"
                    />
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-faint">Sem telas nesta versão</div>
                )}
              </div>
            </>
          )}
          {open.tab === 'palette' && <PaletteTab slug={slug} version={blend.version} />}
          {open.tab === 'fonts' && <FontsTab slug={slug} version={blend.version} />}
          {open.tab === 'tokens' && <TokensTab slug={slug} version={blend.version} />}
          {open.tab === 'assets' && <AssetsTab slug={slug} version={blend.version} path={blend.path} />}
          {open.tab === 'notes' && <NotesTab slug={slug} version={blend.version} />}
        </div>
      )}
    </div>
  )
}
