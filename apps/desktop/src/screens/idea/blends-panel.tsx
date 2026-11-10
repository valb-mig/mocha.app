import { useState } from 'react'
import { ChevronDown, ChevronRight, Copy, FolderOpen, Monitor, MoreHorizontal, Plus, Sparkles, Trash2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import type { BlendVersion } from '@mocha/core'
import { Confirm } from '@/components/confirm'
import { FramePreview } from '@/components/frame-preview'
import { Button } from '@/components/ui/button'
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/tooltip'
import { backend } from '@/lib/backend'
import { cn } from '@/lib/cn'
import type { OpenBlend } from '@/lib/nav'
import { timeAgo } from '@/lib/time'
import { keys, queryClient, useBlendTick, useBlends, vault } from '@/lib/vault'

export async function createVersion(slug: string, from?: number | 'empty'): Promise<BlendVersion> {
  const blend = await vault.createBlend(slug, { from })
  await queryClient.invalidateQueries({ queryKey: keys.idea(slug) })
  return blend
}

export function BlendsPanel({ slug, onOpen }: { slug: string; onOpen: (open: OpenBlend) => void }) {
  const { data: blends, isPending } = useBlends(slug)
  const latest = blends?.[0]

  const create = async (from?: number | 'empty') => {
    const blend = await createVersion(slug, from)
    onOpen({ version: blend.version, tab: 'screens' })
  }

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-2 pl-4">
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint uppercase">Blends</span>
        {latest && (
          <Menu
            align="end"
            trigger={
              <Button variant="ghost" size="sm">
                <Plus /> Nova versão
              </Button>
            }
          >
            <MenuItem icon={<Copy />} onSelect={() => create(latest.version)}>
              A partir da v{latest.version}
            </MenuItem>
            <MenuItem icon={<Sparkles />} onSelect={() => create('empty')}>
              Do zero
            </MenuItem>
          </Menu>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {isPending ? (
          <div className="space-y-3 p-4">
            <Skeleton className="h-4 w-16" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="aspect-[16/10]" />
              <Skeleton className="aspect-[16/10]" />
            </div>
          </div>
        ) : !blends?.length ? (
          <EmptyBlends onCreate={() => create('empty')} />
        ) : (
          blends.map((b, i) => (
            <VersionSection
              key={b.version}
              slug={slug}
              blend={b}
              latest={i === 0}
              onOpen={onOpen}
              onCopy={() => create(b.version)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function VersionSection({
  slug,
  blend,
  latest,
  onOpen,
  onCopy,
}: {
  slug: string
  blend: BlendVersion
  latest: boolean
  onOpen: (open: OpenBlend) => void
  onCopy: () => void
}) {
  const [open, setOpen] = useState(latest)
  const [trashing, setTrashing] = useState(false)
  const tick = useBlendTick(slug, blend.version)

  return (
    <section className="border-b border-line">
      <div className="group flex h-10 items-center gap-2 pr-2 pl-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex h-7 items-center gap-1.5 rounded-md pr-2 pl-1 text-muted transition-colors hover:text-fg"
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          <span
            className={cn(
              'rounded-[5px] px-1.5 py-px font-mono text-[12px] font-medium',
              latest ? 'bg-accent-wash text-accent-strong' : 'bg-raised text-soft',
            )}
          >
            v{blend.version}
          </span>
        </button>
        <span className="truncate text-[12px] text-faint">
          {blend.basedOn ? `de v${blend.basedOn} · ` : ''}
          {timeAgo(blend.createdAt)}
        </span>
        <span className="ml-auto flex items-center gap-1 text-[12px] text-faint">
          <Monitor className="size-3.5" />
          {blend.screens.length}
        </span>
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="icon-sm" className="opacity-0 group-hover:opacity-100 aria-expanded:opacity-100" aria-label="Mais">
              <MoreHorizontal />
            </Button>
          }
        >
          <MenuItem icon={<Copy />} onSelect={onCopy}>
            Nova versão a partir desta
          </MenuItem>
          <MenuItem icon={<FolderOpen />} onSelect={() => backend.reveal(blend.path)}>
            Abrir pasta
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Trash2 />} danger onSelect={() => setTrashing(true)}>
            Mover para a lixeira
          </MenuItem>
        </Menu>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 px-4 pt-1 pb-4">
              {blend.screens.map((s) => (
                <button
                  key={s.file}
                  onClick={() => onOpen({ version: blend.version, screen: s.file, tab: 'screens' })}
                  className="group/thumb text-left"
                >
                  <div className="overflow-hidden rounded-lg border border-line transition-[border-color,transform] duration-200 group-hover/thumb:-translate-y-0.5 group-hover/thumb:border-line-strong">
                    <FramePreview path={s.path} tick={tick} mode="thumb" />
                  </div>
                  <div className="mt-1.5 truncate px-0.5 text-[12px] text-muted group-hover/thumb:text-soft">{s.title}</div>
                </button>
              ))}
              {!blend.screens.length && <div className="col-span-full py-3 text-[12px] text-faint">Sem telas</div>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <Confirm
        open={trashing}
        onOpenChange={setTrashing}
        title={`Mover v${blend.version} para a lixeira?`}
        action="Mover"
        onConfirm={async () => {
          await vault.trashBlend(slug, blend.version)
          await queryClient.invalidateQueries({ queryKey: keys.idea(slug) })
          toast(`v${blend.version} na lixeira do vault`)
        }}
      />
    </section>
  )
}

function EmptyBlends({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-6 px-6 pb-10"
    >
      <div className="relative h-24 w-40">
        <div className="absolute inset-x-4 top-0 h-20 rounded-lg border border-line bg-raised/60" />
        <div className="absolute inset-x-2 top-2 h-20 rounded-lg border border-line bg-raised" />
        <div className="absolute inset-x-0 top-4 flex h-20 flex-col gap-1.5 rounded-lg border border-line-strong bg-hover p-3">
          <div className="flex gap-1">
            {['#c98f5a', '#efe5d6', '#45382e'].map((c) => (
              <span key={c} className="size-3 rounded-full" style={{ background: c }} />
            ))}
          </div>
          <div className="mt-1 h-1.5 w-3/4 rounded-full bg-line-strong" />
          <div className="h-1.5 w-1/2 rounded-full bg-line-strong" />
        </div>
      </div>
      <Tip label="Ou peça a um agente pelo MCP">
        <Button variant="primary" onClick={onCreate}>
          <Plus /> Criar v1
        </Button>
      </Tip>
    </motion.div>
  )
}
