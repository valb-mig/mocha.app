import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, FolderOpen, Layers, MoreHorizontal, Pencil, Plus, Search, Trash2, Plug } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { toast } from 'sonner'
import { normalize, type IdeaSummary } from '@mocha/core'
import { Confirm } from '@/components/confirm'
import { FramePreview } from '@/components/frame-preview'
import { Logo } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { ContextMenu, Menu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/tooltip'
import { backend } from '@/lib/backend'
import { cn } from '@/lib/cn'
import { useNav } from '@/lib/nav'
import { timeAgo } from '@/lib/time'
import { keys, queryClient, useBlendTick, useIdeas, vault } from '@/lib/vault'
import { McpDialog } from './mcp-dialog'

export function IdeasScreen() {
  const { data: ideas, isPending } = useIdeas()
  const openIdea = useNav((s) => s.openIdea)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const [mcpOpen, setMcpOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, .cm-editor')
      if (typing) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'n' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault()
        setCreating(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const filtered = useMemo(() => {
    const q = normalize(query)
    return q ? ideas?.filter((i) => normalize(i.name).includes(q)) : ideas
  }, [ideas, query])

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line px-6">
        <Logo />
        <div className="flex-1" />
        <div className="relative w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-faint" />
          <Input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Escape' && (setQuery(''), e.currentTarget.blur())}
            placeholder="Buscar"
            className="h-8 bg-panel pl-8"
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
            <Kbd>/</Kbd>
          </span>
        </div>
        <Menu
          align="end"
          trigger={
            <Button variant="ghost" size="icon" aria-label="Mais">
              <MoreHorizontal />
            </Button>
          }
        >
          <MenuItem icon={<FolderOpen />} onSelect={() => backend.reveal('')}>
            Abrir pasta do vault
          </MenuItem>
          <MenuItem
            icon={<FolderOpen />}
            onSelect={async () => {
              const picked = await backend.pickFolder()
              if (!picked) return
              await backend.setVault(picked)
              await vault.init()
              await queryClient.resetQueries()
            }}
          >
            Trocar pasta…
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Plug />} onSelect={() => setMcpOpen(true)}>
            Conectar agente (MCP)
          </MenuItem>
        </Menu>
        <Tip label="Nova ideia" shortcut="N">
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Plus /> Nova ideia
          </Button>
        </Tip>
      </header>

      <main className="flex-1 overflow-y-auto px-6 pt-6 pb-12">
        {isPending ? (
          <Grid>
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="overflow-hidden rounded-xl border border-line bg-panel">
                <Skeleton className="aspect-[16/10] rounded-none" />
                <div className="space-y-2.5 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
            ))}
          </Grid>
        ) : !ideas?.length ? (
          <EmptyState onCreate={() => setCreating(true)} />
        ) : filtered?.length === 0 ? (
          <div className="pt-24 text-center text-muted">Nada com “{query}”</div>
        ) : (
          <Grid>
            <AnimatePresence initial={true}>
              {filtered?.map((idea, i) => (
                <IdeaCard key={idea.slug} idea={idea} index={i} onOpen={() => openIdea(idea.slug)} />
              ))}
            </AnimatePresence>
          </Grid>
        )}
      </main>

      <CreateIdeaDialog open={creating} onOpenChange={setCreating} onCreated={(slug) => openIdea(slug)} />
      <McpDialog open={mcpOpen} onOpenChange={setMcpOpen} />
    </div>
  )
}

const Grid = ({ children }: { children: React.ReactNode }) => (
  <div className="grid grid-cols-[repeat(auto-fill,minmax(270px,1fr))] gap-5">{children}</div>
)

function IdeaCard({ idea, index, onOpen }: { idea: IdeaSummary; index: number; onOpen: () => void }) {
  const [renaming, setRenaming] = useState(false)
  const [trashing, setTrashing] = useState(false)
  const latest = idea.versions[0]

  const menu = (
    <>
      <MenuItem icon={<Pencil />} onSelect={() => setRenaming(true)}>
        Renomear
      </MenuItem>
      <MenuItem icon={<FolderOpen />} onSelect={() => backend.reveal(`ideias/${idea.slug}`)}>
        Abrir pasta
      </MenuItem>
      <MenuSeparator />
      <MenuItem icon={<Trash2 />} danger onSelect={() => setTrashing(true)}>
        Mover para a lixeira
      </MenuItem>
    </>
  )

  return (
    <>
      <ContextMenu menu={menu}>
        <motion.button
          layout="position"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 12) * 0.035, duration: 0.35, ease: [0.22, 1, 0.36, 1] } }}
          exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.15 } }}
          onClick={onOpen}
          className="group relative overflow-hidden rounded-xl border border-line bg-panel text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong"
        >
          <div className="relative border-b border-line">
            {idea.cover ? <Cover slug={idea.slug} version={idea.cover.version} path={idea.cover.path} /> : <Placeholder name={idea.name} />}
          </div>
          <div className="p-4">
            <div className="truncate font-serif text-[17px] font-medium tracking-[-0.01em] text-fg">{idea.name}</div>
            <div className="mt-1.5 flex items-center gap-3 text-[12px] text-muted">
              <span className="flex items-center gap-1">
                <FileText className="size-3.5 text-faint" />
                {idea.topicCount}
              </span>
              {latest !== undefined && (
                <span className="flex items-center gap-1">
                  <Layers className="size-3.5 text-faint" />
                  <span className="font-mono">v{latest}</span>
                </span>
              )}
              <span className="ml-auto text-faint">{timeAgo(idea.updatedAt)}</span>
            </div>
          </div>
        </motion.button>
      </ContextMenu>
      <RenameDialog
        open={renaming}
        onOpenChange={setRenaming}
        initial={idea.name}
        onSave={async (name) => {
          await vault.renameIdea(idea.slug, name)
          await queryClient.invalidateQueries({ queryKey: keys.ideas })
        }}
      />
      <Confirm
        open={trashing}
        onOpenChange={setTrashing}
        title={`Mover “${idea.name}” para a lixeira?`}
        action="Mover"
        onConfirm={async () => {
          await vault.trashIdea(idea.slug)
          await queryClient.invalidateQueries({ queryKey: keys.ideas })
          toast('Na lixeira do vault', { description: '.lixeira/' })
        }}
      >
        A pasta vai para <span className="font-mono text-soft">.lixeira/</span> dentro do vault.
      </Confirm>
    </>
  )
}

function Cover({ slug, version, path }: { slug: string; version: number; path: string }) {
  const tick = useBlendTick(slug, version)
  return <FramePreview path={path} tick={tick} mode="thumb" />
}

/** Sem blend ainda: monograma sobre listras, para cada ideia ter cara propria. */
function Placeholder({ name }: { name: string }) {
  // Matiz sempre na faixa quente (do caramelo ao oliva), para ficar no tema.
  const hue = 30 + ([...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 997, 7) % 80)
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')
  return (
    <div
      className="flex aspect-[16/10] items-center justify-center"
      style={{
        background: `repeating-linear-gradient(135deg, oklch(0.22 0.025 ${hue}) 0 10px, oklch(0.205 0.022 ${hue}) 10px 20px)`,
      }}
    >
      <span className="font-serif text-[44px] font-medium tracking-[-0.03em]" style={{ color: `oklch(0.72 0.06 ${hue})` }}>
        {initials}
      </span>
    </div>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center pt-[14vh] text-center"
    >
      <div className="relative mb-8 h-32 w-44">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={cn('absolute inset-x-0 h-28 rounded-xl border border-line-strong bg-panel', i === 2 && 'bg-raised')}
            style={{ top: i * 6, transform: `rotate(${(i - 1) * 5}deg) translateX(${(i - 1) * 10}px)` }}
          />
        ))}
        <div className="absolute inset-x-6 top-[38px] space-y-2">
          <div className="h-2 w-2/3 rounded-full bg-line-strong" />
          <div className="h-2 w-1/2 rounded-full bg-line" />
          <div className="mt-4 h-5 w-16 rounded-md bg-accent/80" />
        </div>
      </div>
      <h2 className="font-serif text-[22px] font-medium">Nenhuma ideia ainda</h2>
      <Button variant="primary" size="lg" className="mt-6" onClick={onCreate}>
        <Plus /> Nova ideia
      </Button>
    </motion.div>
  )
}

function CreateIdeaDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  onCreated: (slug: string) => void
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (open) setName('')
  }, [open])

  const submit = async () => {
    if (!name.trim() || busy) return
    setBusy(true)
    try {
      const idea = await vault.createIdea(name)
      await queryClient.invalidateQueries({ queryKey: keys.ideas })
      onOpenChange(false)
      onCreated(idea.slug)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Nova ideia">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim() || busy}>
            Criar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

export function RenameDialog({
  open,
  onOpenChange,
  initial,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial: string
  onSave: (name: string) => Promise<void>
}) {
  const [name, setName] = useState(initial)
  useEffect(() => {
    if (open) setName(initial)
  }, [open, initial])
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Renomear">
      <form
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) return
          await onSave(name)
          onOpenChange(false)
        }}
      >
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} onFocus={(e) => e.currentTarget.select()} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Salvar
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
