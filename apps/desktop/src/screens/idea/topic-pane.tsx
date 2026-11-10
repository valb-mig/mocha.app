import { useEffect, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import { motion } from 'motion/react'
import { briefingDir, topicPath } from '@mocha/core'
import { Button } from '@/components/ui/button'
import { MarkdownEditor } from '@/editor/markdown-editor'
import { keys, queryClient, vault } from '@/lib/vault'

export function TopicPane({
  slug,
  title,
  onRenamed,
  onCreate,
}: {
  slug: string
  title?: string
  onRenamed: (title: string) => void
  onCreate: () => void
}) {
  if (!title) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-muted">
        <div className="space-y-2 opacity-60">
          <div className="h-2 w-28 rounded-full bg-line-strong" />
          <div className="h-2 w-20 rounded-full bg-line" />
          <div className="h-2 w-24 rounded-full bg-line" />
        </div>
        <Button variant="secondary" onClick={onCreate}>
          <Plus /> Novo tópico
        </Button>
      </div>
    )
  }

  return (
    <motion.div
      key={title}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="flex h-full flex-col"
    >
      <TitleInput
        slug={slug}
        title={title}
        onRenamed={onRenamed}
      />
      <div className="min-h-0 flex-1">
        <MarkdownEditor
          key={`${slug}/${title}`}
          path={topicPath(slug, title)}
          baseDir={briefingDir(slug)}
          placeholder="Escreva, cole imagens de referência…"
          saveImage={async (file) =>
            vault.saveBriefingAsset(slug, file.name || 'colado.png', new Uint8Array(await file.arrayBuffer()))
          }
        />
      </div>
    </motion.div>
  )
}

/** Titulo do topico = nome do arquivo. Renomear aqui renomeia o `.md`. */
function TitleInput({ slug, title, onRenamed }: { slug: string; title: string; onRenamed: (t: string) => void }) {
  const [value, setValue] = useState(title)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => setValue(title), [title])

  const commit = async () => {
    const next = value.trim()
    if (!next || next === title) return setValue(title)
    const final = await vault.renameTopic(slug, title, next)
    await queryClient.invalidateQueries({ queryKey: keys.idea(slug) })
    onRenamed(final)
  }

  return (
    <div className="mx-auto w-full max-w-[720px] shrink-0 px-10 pt-10 pb-2">
      <input
        ref={ref}
        value={value}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            ref.current?.blur()
            const editor = ref.current?.closest('.flex-col')?.querySelector<HTMLElement>('.cm-content')
            editor?.focus()
          }
          if (e.key === 'Escape') {
            setValue(title)
            ref.current?.blur()
          }
        }}
        className="w-full bg-transparent font-serif text-[34px] leading-tight font-semibold tracking-[-0.02em] text-fg outline-none placeholder:text-faint"
      />
    </div>
  )
}
