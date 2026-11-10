import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, FolderOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Group, Panel, Separator, useDefaultLayout, type PanelImperativeHandle } from 'react-resizable-panels'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tip } from '@/components/ui/tooltip'
import { backend } from '@/lib/backend'
import { useIdeaUi, useNav, type OpenBlend } from '@/lib/nav'
import { keys, queryClient, useIdea, useTopics, vault } from '@/lib/vault'
import { RenameDialog } from '../ideas'
import { BlendViewer } from './blend-viewer'
import { BlendsPanel } from './blends-panel'
import { TopicPane } from './topic-pane'
import { TopicsSidebar } from './topics'

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest('input, textarea, [contenteditable], .cm-editor')

export function IdeaScreen({ slug }: { slug: string }) {
  const { data: idea, error } = useIdea(slug)
  const { data: topics } = useTopics(slug)
  const ui = useIdeaUi(slug)
  const goHome = useNav((s) => s.goHome)
  const patch = useCallback((p: Parameters<ReturnType<typeof useNav.getState>['patchUi']>[1]) => useNav.getState().patchUi(slug, p), [slug])
  const [renaming, setRenaming] = useState(false)
  const blendsPanel = useRef<PanelImperativeHandle | null>(null)
  const layout = useDefaultLayout({ id: 'mocha:idea-layout', storage: localStorage })

  const selected = topics?.find((t) => t.title === ui.topic)?.title ?? topics?.[0]?.title
  const expanded = !!ui.expanded && !!ui.blend

  const openBlend = (open: OpenBlend) => {
    patch({ blend: open })
    // Abrir um blend no painel estreito pede espaco: cresce ate a metade.
    const size = blendsPanel.current?.getSize()
    if (size && size.asPercentage < 48) blendsPanel.current?.resize('50%')
  }
  const closeBlend = useCallback(() => patch({ blend: undefined, expanded: false }), [patch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isTyping(e.target)) return
      const current = useNav.getState().ui[slug]
      if (current?.expanded) patch({ expanded: false })
      else if (current?.blend) patch({ blend: undefined })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [slug, patch])

  useEffect(() => {
    if (error) goHome()
  }, [error, goHome])

  const createTopic = async () => {
    const t = await vault.createTopic(slug)
    await queryClient.invalidateQueries({ queryKey: keys.idea(slug) })
    patch({ topic: t.title })
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line pr-3 pl-2">
        <Tip label="Ideias">
          <Button variant="ghost" size="icon" onClick={goHome} aria-label="Ideias">
            <ArrowLeft />
          </Button>
        </Tip>
        {idea ? (
          <button
            onDoubleClick={() => setRenaming(true)}
            className="truncate rounded-md px-1.5 font-serif text-[17px] font-medium tracking-[-0.01em] text-fg"
          >
            {idea.name}
          </button>
        ) : (
          <Skeleton className="h-5 w-40" />
        )}
        <div className="flex-1" />
        <Tip label="Abrir pasta">
          <Button variant="ghost" size="icon" onClick={() => backend.reveal(`ideias/${slug}`)} aria-label="Abrir pasta">
            <FolderOpen />
          </Button>
        </Tip>
      </header>

      <div className="relative min-h-0 flex-1">
        <Group
          inert={expanded}
          orientation="horizontal"
          id="mocha:idea-layout"
          defaultLayout={layout.defaultLayout}
          onLayoutChanged={layout.onLayoutChanged}
          className="h-full"
        >
          <Panel id="topics" defaultSize={220} minSize={150} maxSize={380} collapsible collapsedSize={0}>
            <div className="h-full bg-panel">
              <TopicsSidebar
                slug={slug}
                selected={selected}
                onSelect={(topic) => patch({ topic })}
                onCreated={(topic) => patch({ topic })}
              />
            </div>
          </Panel>
          <Separator />
          <Panel id="editor" minSize={340}>
            <TopicPane slug={slug} title={selected} onRenamed={(topic) => patch({ topic })} onCreate={createTopic} />
          </Panel>
          <Separator />
          <Panel id="blends" defaultSize="40%" minSize={300} panelRef={blendsPanel}>
            {ui.blend && !expanded ? (
              <BlendViewer
                slug={slug}
                open={ui.blend}
                expanded={false}
                onChange={(blend) => patch({ blend })}
                onClose={closeBlend}
                onToggleExpand={() => patch({ expanded: true })}
              />
            ) : (
              <BlendsPanel slug={slug} onOpen={openBlend} />
            )}
          </Panel>
        </Group>

        <AnimatePresence>
          {expanded && ui.blend && (
            <motion.div
              initial={{ opacity: 0, scale: 0.985 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.985 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 z-20"
            >
              <BlendViewer
                slug={slug}
                open={ui.blend}
                expanded
                onChange={(blend) => patch({ blend })}
                onClose={closeBlend}
                onToggleExpand={() => patch({ expanded: false })}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {idea && (
        <RenameDialog
          open={renaming}
          onOpenChange={setRenaming}
          initial={idea.name}
          onSave={async (name) => {
            await vault.renameIdea(slug, name)
            await queryClient.invalidateQueries({ queryKey: keys.ideas })
            await queryClient.invalidateQueries({ queryKey: keys.idea(slug) })
          }}
        />
      )}
    </div>
  )
}
