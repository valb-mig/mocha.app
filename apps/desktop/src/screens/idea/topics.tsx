import { useEffect, useRef, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Reorder } from 'motion/react'
import { toast } from 'sonner'
import type { Topic } from '@mocha/core'
import { Confirm } from '@/components/confirm'
import { Button } from '@/components/ui/button'
import { ContextMenu, MenuItem, MenuSeparator } from '@/components/ui/menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'
import { keys, queryClient, useTopics, vault } from '@/lib/vault'

export function TopicsSidebar({
  slug,
  selected,
  onSelect,
  onCreated,
}: {
  slug: string
  selected?: string
  onSelect: (title: string) => void
  onCreated: (title: string) => void
}) {
  const { data: topics, isPending } = useTopics(slug)
  const [order, setOrder] = useState<string[]>([])
  const [renaming, setRenaming] = useState<string | null>(null)
  const [trashing, setTrashing] = useState<Topic | null>(null)
  const dragging = useRef(false)
  const orderRef = useRef(order)
  orderRef.current = order

  useEffect(() => {
    if (topics && !dragging.current) setOrder(topics.map((t) => t.title))
  }, [topics])

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.idea(slug) })

  const create = async () => {
    const topic = await vault.createTopic(slug)
    await refresh()
    onCreated(topic.title)
  }

  const rename = async (from: string, to: string) => {
    setRenaming(null)
    if (!to.trim() || to === from) return
    const final = await vault.renameTopic(slug, from, to)
    await refresh()
    if (selected === from) onSelect(final)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between pr-2 pl-4">
        <span className="text-[11px] font-medium tracking-[0.08em] text-faint uppercase">Briefing</span>
        <Tip label="Novo tópico">
          <Button variant="ghost" size="icon-sm" onClick={create} aria-label="Novo tópico">
            <Plus />
          </Button>
        </Tip>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {isPending ? (
          <div className="space-y-2 px-2 pt-1">
            {[70, 55, 80].map((w) => (
              <Skeleton key={w} className="h-5" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : (
          <Reorder.Group
            axis="y"
            values={order}
            onReorder={setOrder}
            className="space-y-px"
          >
            {order.map((title) => (
              <Reorder.Item
                key={title}
                value={title}
                onDragStart={() => (dragging.current = true)}
                onDragEnd={async () => {
                  dragging.current = false
                  await vault.reorderTopics(slug, orderRef.current)
                  await refresh()
                }}
                className="relative"
                whileDrag={{ scale: 1.02, zIndex: 10 }}
              >
                {renaming === title ? (
                  <RenameInput initial={title} onDone={(v) => rename(title, v)} />
                ) : (
                  <ContextMenu
                    menu={
                      <>
                        <MenuItem icon={<Pencil />} onSelect={() => setRenaming(title)}>
                          Renomear
                        </MenuItem>
                        <MenuSeparator />
                        <MenuItem
                          icon={<Trash2 />}
                          danger
                          onSelect={() => setTrashing(topics?.find((t) => t.title === title) ?? null)}
                        >
                          Mover para a lixeira
                        </MenuItem>
                      </>
                    }
                  >
                    <button
                      onClick={() => onSelect(title)}
                      onDoubleClick={() => setRenaming(title)}
                      className={cn(
                        'group relative flex h-8 w-full items-center rounded-md px-2.5 text-left text-[13px] transition-colors',
                        selected === title ? 'bg-hover text-fg' : 'text-muted hover:bg-raised hover:text-soft',
                      )}
                    >
                      {selected === title && <span className="absolute top-2 bottom-2 left-0 w-[2px] rounded-full bg-accent" />}
                      <span className="truncate">{title}</span>
                    </button>
                  </ContextMenu>
                )}
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
      </div>
      <Confirm
        open={!!trashing}
        onOpenChange={(o) => !o && setTrashing(null)}
        title={`Mover “${trashing?.title}” para a lixeira?`}
        action="Mover"
        onConfirm={async () => {
          if (!trashing) return
          await vault.trashTopic(slug, trashing.title)
          await refresh()
          if (selected === trashing.title) {
            const next = order.find((t) => t !== trashing.title)
            if (next) onSelect(next)
          }
          toast('Tópico na lixeira do vault')
        }}
      />
    </div>
  )
}

function RenameInput({ initial, onDone }: { initial: string; onDone: (value: string) => void }) {
  const [value, setValue] = useState(initial)
  const done = useRef(false)
  const finish = (v: string) => {
    if (done.current) return
    done.current = true
    onDone(v)
  }
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') finish(value)
        if (e.key === 'Escape') finish(initial)
      }}
      className="h-8 w-full rounded-md border border-accent/60 bg-bg px-2.5 text-[13px] text-fg outline-none"
    />
  )
}
