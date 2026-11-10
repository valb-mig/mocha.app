import { useEffect, useRef, useState } from 'react'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { drawSelection, dropCursor, EditorView, keymap, placeholder as placeholderExt } from '@codemirror/view'
import { Skeleton } from '@/components/ui/skeleton'
import { backend } from '@/lib/backend'
import { cn } from '@/lib/cn'
import { onVaultChange } from '@/lib/vault'
import { livePreview } from './live-preview'

const SAVE_DELAY = 450

/** `assets/x.png` relativo a pasta do arquivo, resolvendo `..` sem sair do vault. */
function resolveRelative(base: string, src: string): string {
  const out = base.split('/').filter(Boolean)
  for (const seg of decodeURI(src).split('/')) {
    if (seg === '..') out.pop()
    else if (seg && seg !== '.') out.push(seg)
  }
  return out.join('/')
}

export interface MarkdownEditorProps {
  /** Arquivo `.md`, relativo ao vault. */
  path: string
  /** Pasta contra a qual imagens relativas sao resolvidas (a do arquivo). */
  baseDir: string
  /** Salva a imagem colada/solta e devolve o caminho relativo a `baseDir`. */
  saveImage: (file: File) => Promise<string>
  placeholder?: string
  className?: string
  autoFocus?: boolean
}

/**
 * Monte com `key={path}`: cada arquivo ganha um editor proprio, e trocar de
 * topico descarta o historico de desfazer do anterior, como num editor de texto.
 */
export function MarkdownEditor({ path, baseDir, saveImage, placeholder, className, autoFocus }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const saveImageRef = useRef(saveImage)
  saveImageRef.current = saveImage

  useEffect(() => {
    let view: EditorView | null = null
    let saved = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const flush = () => {
      clearTimeout(timer)
      timer = undefined
      if (!view) return
      const text = view.state.doc.toString()
      if (text === saved) return
      saved = text
      void backend.fs.writeText(path, text)
    }

    const insertImages = async (files: File[], pos: number) => {
      if (!view) return
      const links: string[] = []
      for (const f of files) links.push(`![](${encodeURI(await saveImageRef.current(f))})`)
      const lineAt = view.state.doc.lineAt(Math.min(pos, view.state.doc.length))
      const before = lineAt.text.trim() && pos !== lineAt.from ? '\n' : ''
      const insert = `${before}${links.join('\n')}\n`
      view.dispatch({ changes: { from: pos, insert }, selection: { anchor: pos + insert.length } })
      view.focus()
    }

    const images = (list?: FileList | null) => [...(list ?? [])].filter((f) => f.type.startsWith('image/'))

    void (async () => {
      const initial = await backend.fs.readText(path).catch(() => '')
      if (cancelled || !host.current) return
      saved = initial
      view = new EditorView({
        parent: host.current,
        state: EditorState.create({
          doc: initial,
          extensions: [
            history(),
            drawSelection(),
            dropCursor(),
            EditorView.lineWrapping,
            EditorView.contentAttributes.of({ spellcheck: 'false', autocapitalize: 'sentences' }),
            markdown({ base: markdownLanguage }),
            keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
            placeholderExt(placeholder ?? ''),
            livePreview({
              resolveImage: (src) =>
                /^(https?:|data:|blob:)/.test(src) ? src : backend.fileUrl(resolveRelative(baseDir, src)),
            }),
            EditorView.domEventHandlers({
              paste(event, v) {
                const files = images(event.clipboardData?.files)
                if (!files.length) return false
                event.preventDefault()
                void insertImages(files, v.state.selection.main.from)
                return true
              },
              drop(event, v) {
                const files = images(event.dataTransfer?.files)
                if (!files.length) return false
                event.preventDefault()
                const pos = v.posAtCoords({ x: event.clientX, y: event.clientY }) ?? v.state.selection.main.from
                void insertImages(files, pos)
                return true
              },
              blur: () => flush(),
            }),
            EditorView.updateListener.of((u) => {
              if (!u.docChanged) return
              clearTimeout(timer)
              timer = setTimeout(flush, SAVE_DELAY)
            }),
          ],
        }),
      })
      setLoading(false)
      if (autoFocus) view.focus()
    })()

    // Quem mudou o arquivo foi outro (um agente, outro editor): se nao ha nada
    // por salvar aqui, a versao do disco entra no lugar.
    const off = onVaultChange(async (paths) => {
      if (!paths.includes(path) || !view || timer) return
      const disk = await backend.fs.readText(path).catch(() => null)
      if (disk === null || !view || disk === saved || disk === view.state.doc.toString()) return
      saved = disk
      const head = Math.min(view.state.selection.main.head, disk.length)
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: disk }, selection: { anchor: head } })
    })

    return () => {
      cancelled = true
      off()
      flush()
      view?.destroy()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path])

  return (
    <div className={cn('mocha-editor relative h-full', className)}>
      {loading && (
        <div className="mx-auto max-w-[720px] space-y-3 px-10 pt-3">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      )}
      <div ref={host} className="h-full" />
    </div>
  )
}

