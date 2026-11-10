import { useEffect, type ReactNode } from 'react'
import { Copy, FolderOpen } from 'lucide-react'
import { motion } from 'motion/react'
import { toast } from 'sonner'
import {
  blendDir,
  fontStack,
  googleFontUrl,
  notesPath,
  tokenVar,
  type ColorToken,
  type FontToken,
  type Tokens,
} from '@mocha/core'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/tooltip'
import { MarkdownEditor } from '@/editor/markdown-editor'
import { backend } from '@/lib/backend'
import { fileSize } from '@/lib/time'
import { useBlendAssets, useTokens, vault } from '@/lib/vault'

async function copy(text: string, what = text) {
  await navigator.clipboard.writeText(text)
  toast('Copiado', { description: what })
}

const stagger = (i: number) => ({
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { delay: Math.min(i, 16) * 0.025, duration: 0.3, ease: [0.22, 1, 0.36, 1] as const } },
})

function Scroll({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">{children}</div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-9 last:mb-0">
      <h3 className="mb-3 text-[11px] font-medium tracking-[0.08em] text-faint uppercase">{title}</h3>
      {children}
    </section>
  )
}

function Empty({ file, children }: { file: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 pb-10 text-faint">
      <span>
        Vazio em <span className="font-mono text-muted">{file}</span>
      </span>
      {children}
    </div>
  )
}

function useTokensView(slug: string, version: number) {
  const q = useTokens(slug, version)
  const state: 'loading' | 'error' | 'ok' = q.isPending ? 'loading' : q.error ? 'error' : 'ok'
  return { tokens: q.data as Tokens | undefined, state, error: q.error }
}

function TokensError({ error }: { error: unknown }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 font-mono text-[12px] text-danger">
        {error instanceof Error ? error.message : String(error)}
      </div>
    </div>
  )
}

const GridSkeleton = () => (
  <Scroll>
    <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  </Scroll>
)

// ------------------------------------------------------------- paleta

export function PaletteTab({ slug, version }: { slug: string; version: number }) {
  const { tokens, state, error } = useTokensView(slug, version)
  if (state === 'loading') return <GridSkeleton />
  if (state === 'error') return <TokensError error={error} />
  if (!tokens?.colors.length) return <Empty file="tokens.json → colors" />

  const groups = new Map<string, ColorToken[]>()
  for (const c of tokens.colors) {
    const g = c.group ?? 'cores'
    groups.set(g, [...(groups.get(g) ?? []), c])
  }
  let i = 0
  return (
    <Scroll>
      {[...groups].map(([group, colors]) => (
        <Section key={group} title={group}>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-4">
            {colors.map((c) => (
              <motion.div key={c.name} {...stagger(i++)} className="group">
                <button
                  onClick={() => copy(c.value)}
                  className="block h-24 w-full rounded-lg border border-white/8 transition-transform duration-200 group-hover:-translate-y-0.5"
                  style={{ background: c.value }}
                  aria-label={`Copiar ${c.value}`}
                />
                <div className="mt-2 flex items-start justify-between gap-2 px-0.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] text-soft">{c.name}</div>
                    <div className="truncate font-mono text-[11.5px] text-faint uppercase">{c.value}</div>
                  </div>
                  <Tip label={`var(${tokenVar('color', c.name)})`}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => copy(`var(${tokenVar('color', c.name)})`)}
                      aria-label="Copiar variável"
                    >
                      <Copy />
                    </Button>
                  </Tip>
                </div>
              </motion.div>
            ))}
          </div>
        </Section>
      ))}
    </Scroll>
  )
}

// ------------------------------------------------------------- fontes

const loadedFonts = new Set<string>()

/** Carrega a fonte do Google na propria janela para o especime sair na fonte certa. */
function useFontLinks(fonts: FontToken[] | undefined) {
  useEffect(() => {
    for (const f of fonts ?? []) {
      if ((f.source ?? 'google') !== 'google') continue
      const href = googleFontUrl(f)
      if (loadedFonts.has(href)) continue
      loadedFonts.add(href)
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      document.head.appendChild(link)
    }
  }, [fonts])
}

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black',
}

export function FontsTab({ slug, version }: { slug: string; version: number }) {
  const { tokens, state, error } = useTokensView(slug, version)
  useFontLinks(tokens?.fonts)
  if (state === 'loading') return <GridSkeleton />
  if (state === 'error') return <TokensError error={error} />
  if (!tokens?.fonts.length) return <Empty file="tokens.json → fonts" />

  return (
    <Scroll>
      <div className="space-y-5">
        {tokens.fonts.map((f, i) => {
          const family = fontStack(f)
          const weights = f.weights?.length ? f.weights : [400]
          return (
            <motion.article key={f.name} {...stagger(i)} className="overflow-hidden rounded-xl border border-line bg-bg">
              <header className="flex items-center gap-3 border-b border-line px-5 py-3">
                <button
                  onClick={() => copy(`var(${tokenVar('font', f.name)})`)}
                  className="rounded-[5px] bg-accent-wash px-1.5 py-px font-mono text-[11.5px] text-accent-strong"
                >
                  {f.name}
                </button>
                <span className="text-[13px] text-soft">{f.family}</span>
                {f.fallback && <span className="font-mono text-[11.5px] text-faint">{f.fallback}</span>}
                <span className="ml-auto text-[11.5px] text-faint">{f.source ?? 'google'}</span>
              </header>
              <div className="grid grid-cols-[auto_1fr] items-center gap-8 px-5 py-6" style={{ fontFamily: family }}>
                <div className="text-[84px] leading-none text-fg">Aa</div>
                <div className="min-w-0">
                  <p className="text-[26px] leading-snug text-fg">
                    {f.sample ?? 'O café coado desperta ideias em cada xícara.'}
                  </p>
                  <p className="mt-3 truncate text-[14px] tracking-wide text-muted">
                    ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz 0123456789
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-line px-5 py-3" style={{ fontFamily: family }}>
                {weights.map((w) => (
                  <span key={w} className="text-[15px] text-soft" style={{ fontWeight: w }}>
                    {WEIGHT_NAMES[w] ?? w} <span className="font-mono text-[11px] text-faint">{w}</span>
                  </span>
                ))}
              </div>
            </motion.article>
          )
        })}
      </div>
    </Scroll>
  )
}

// ------------------------------------------------------------- tokens

export function TokensTab({ slug, version }: { slug: string; version: number }) {
  const { tokens, state, error } = useTokensView(slug, version)
  if (state === 'loading') return <GridSkeleton />
  if (state === 'error') return <TokensError error={error} />
  if (!tokens || (!tokens.radii.length && !tokens.spacing.length && !tokens.shadows.length)) {
    return <Empty file="tokens.json → radii, spacing, shadows" />
  }
  const label = (prefix: string, name: string, value: string) => (
    <button onClick={() => copy(`var(${tokenVar(prefix, name)})`)} className="mt-2 block text-left">
      <div className="text-[12.5px] text-soft">{name}</div>
      <div className="font-mono text-[11px] text-faint">{value}</div>
    </button>
  )

  return (
    <Scroll>
      {tokens.radii.length > 0 && (
        <Section title="Raios">
          <div className="flex flex-wrap gap-6">
            {tokens.radii.map((r, i) => (
              <motion.div key={r.name} {...stagger(i)}>
                <div className="size-20 border-2 border-accent/70 bg-accent-wash" style={{ borderRadius: r.value }} />
                {label('radius', r.name, r.value)}
              </motion.div>
            ))}
          </div>
        </Section>
      )}
      {tokens.spacing.length > 0 && (
        <Section title="Espaçamento">
          <div className="space-y-2">
            {tokens.spacing.map((s, i) => (
              <motion.button
                key={s.name}
                {...stagger(i)}
                onClick={() => copy(`var(${tokenVar('space', s.name)})`)}
                className="grid w-full grid-cols-[80px_80px_1fr] items-center gap-3 text-left"
              >
                <span className="text-[12.5px] text-soft">{s.name}</span>
                <span className="font-mono text-[11px] text-faint">{s.value}</span>
                <span className="h-3 max-w-full rounded-[3px] bg-accent/70" style={{ width: s.value }} />
              </motion.button>
            ))}
          </div>
        </Section>
      )}
      {tokens.shadows.length > 0 && (
        <Section title="Sombras">
          <div className="inline-flex flex-wrap gap-6 rounded-xl bg-[#e9e1d6] p-8">
            {tokens.shadows.map((s, i) => (
              <motion.div key={s.name} {...stagger(i)} className="w-40">
                <div className="h-24 rounded-lg bg-white" style={{ boxShadow: s.value }} />
                <button onClick={() => copy(`var(${tokenVar('shadow', s.name)})`)} className="mt-3 block text-left">
                  <div className="text-[12.5px] text-[#3a2f27]">{s.name}</div>
                  <div className="font-mono text-[10.5px] break-all text-[#7d6c5e]">{s.value}</div>
                </button>
              </motion.div>
            ))}
          </div>
        </Section>
      )}
    </Scroll>
  )
}

// ------------------------------------------------------------- assets

export function AssetsTab({ slug, version, path }: { slug: string; version: number; path: string }) {
  const { data: assets, isPending } = useBlendAssets(slug, version)
  if (isPending) return <GridSkeleton />
  if (!assets?.length) {
    return (
      <Empty file="assets/">
        <Button variant="secondary" size="sm" onClick={() => backend.reveal(path)}>
          <FolderOpen /> Abrir pasta
        </Button>
      </Empty>
    )
  }
  return (
    <Scroll>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-4">
        {assets.map((a, i) => (
          <motion.button key={a.file} {...stagger(i)} onClick={() => copy(a.file)} className="group text-left">
            <div className="checker flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-line transition-[border-color] group-hover:border-line-strong">
              {['woff2', 'woff', 'ttf', 'otf'].includes(a.ext) ? (
                <span className="font-serif text-[36px] text-soft">Aa</span>
              ) : (
                <img src={backend.fileUrl(a.path)} alt={a.file} className="max-h-[78%] max-w-[78%] object-contain" draggable={false} />
              )}
            </div>
            <div className="mt-1.5 truncate px-0.5 text-[12px] text-soft">{a.file}</div>
            <div className="px-0.5 font-mono text-[10.5px] text-faint uppercase">
              {a.ext} · {fileSize(a.size)}
            </div>
          </motion.button>
        ))}
      </div>
    </Scroll>
  )
}

// -------------------------------------------------------------- notas

export function NotesTab({ slug, version }: { slug: string; version: number }) {
  return (
    <div className="min-h-0 flex-1 pt-4">
      <MarkdownEditor
        key={`${slug}/v${version}/notas`}
        path={notesPath(slug, version)}
        baseDir={blendDir(slug, version)}
        placeholder="O que mudou nesta versão…"
        saveImage={async (file) =>
          vault.saveBlendAsset(slug, version, file.name || 'colado.png', new Uint8Array(await file.arrayBuffer()))
        }
      />
    </div>
  )
}
