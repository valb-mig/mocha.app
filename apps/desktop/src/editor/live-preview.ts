import { syntaxTree } from '@codemirror/language'
import type { EditorState, Range } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from '@codemirror/view'
import type { SyntaxNodeRef } from '@lezer/common'

/**
 * Live preview no jeito do Obsidian: a marcacao (`#`, `**`, `[]()`) some fora
 * da linha em que o cursor esta e volta quando ele entra nela. O arquivo
 * continua markdown puro; isto so decora a vista.
 */
export interface LivePreviewOptions {
  resolveImage(src: string): string
}

class ImageWidget extends WidgetType {
  constructor(
    readonly url: string,
    readonly alt: string,
  ) {
    super()
  }
  override eq(other: ImageWidget) {
    return other.url === this.url && other.alt === this.alt
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement('span')
    wrap.className = 'cm-image'
    const img = document.createElement('img')
    img.src = this.url
    img.alt = this.alt
    img.draggable = false
    img.onload = () => view.requestMeasure()
    img.onerror = () => {
      wrap.className = 'cm-image-missing'
      wrap.textContent = `imagem não encontrada · ${this.alt || this.url}`
      view.requestMeasure()
    }
    wrap.appendChild(img)
    return wrap
  }
  override ignoreEvent() {
    return false
  }
}

class BulletWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-bullet'
    el.textContent = '•'
    return el
  }
}

class TaskWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }
  override eq(other: TaskWidget) {
    return other.checked === this.checked
  }
  toDOM() {
    const el = document.createElement('input')
    el.type = 'checkbox'
    el.className = 'cm-task'
    el.checked = this.checked
    el.tabIndex = -1
    return el
  }
  override ignoreEvent() {
    return false
  }
}

class RuleWidget extends WidgetType {
  override eq() {
    return true
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-hr'
    return el
  }
}

const hidden = Decoration.replace({})
const mark = (cls: string) => Decoration.mark({ class: cls })
const dim = mark('cm-mark')
const line = (cls: string) => Decoration.line({ class: cls })
const IMAGE_RE = /^!\[([^\]]*)\]\(\s*<?([^)>\s]+)>?(?:\s+["'][^"']*["'])?\s*\)$/

function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  if (!view.hasFocus) return lines
  const { doc } = view.state
  for (const r of view.state.selection.ranges) {
    const a = doc.lineAt(r.from).number
    const b = doc.lineAt(r.to).number
    for (let n = a; n <= b; n++) lines.add(n)
  }
  return lines
}

function build(view: EditorView, opts: LivePreviewOptions): DecorationSet {
  const { state } = view
  const { doc } = state
  const active = activeLines(view)
  const isActive = (pos: number) => active.has(doc.lineAt(pos).number)
  const decos: Range<Decoration>[] = []
  const hideOrDim = (from: number, to: number, at = from) => {
    if (from >= to) return
    decos.push((isActive(at) ? dim : hidden).range(from, to))
  }
  const eachLine = (from: number, to: number, fn: (lineFrom: number, first: boolean, last: boolean) => void) => {
    const first = doc.lineAt(from).number
    const last = doc.lineAt(to).number
    for (let n = first; n <= last; n++) fn(doc.line(n).from, n === first, n === last)
  }
  const followingSpace = (pos: number) => (state.sliceDoc(pos, pos + 1) === ' ' ? pos + 1 : pos)

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node: SyntaxNodeRef) => {
        const name = node.name
        const heading = /^(?:ATX|Setext)Heading(\d)$/.exec(name)
        if (heading) {
          decos.push(line(`cm-h${heading[1]}`).range(doc.lineAt(node.from).from))
          return
        }
        const parent = node.node.parent?.name
        switch (name) {
          case 'HeaderMark':
            if (parent?.startsWith('ATX')) {
              const atStart = node.from === doc.lineAt(node.from).from
              hideOrDim(node.from, atStart ? followingSpace(node.to) : node.to)
            } else {
              hideOrDim(node.from, node.to)
            }
            return
          case 'Emphasis':
            decos.push(mark('cm-em').range(node.from, node.to))
            return
          case 'StrongEmphasis':
            decos.push(mark('cm-strong').range(node.from, node.to))
            return
          case 'Strikethrough':
            decos.push(mark('cm-strike').range(node.from, node.to))
            return
          case 'InlineCode':
            decos.push(mark('cm-inline-code').range(node.from, node.to))
            return
          case 'EmphasisMark':
          case 'StrikethroughMark':
            hideOrDim(node.from, node.to)
            return
          case 'CodeMark':
            if (parent === 'InlineCode') hideOrDim(node.from, node.to)
            else decos.push(dim.range(node.from, node.to))
            return
          case 'CodeInfo':
            decos.push(dim.range(node.from, node.to))
            return
          case 'Link':
            decos.push(mark('cm-link-text').range(node.from, node.to))
            return
          case 'LinkMark':
            if (parent === 'Link') hideOrDim(node.from, node.to)
            return
          case 'URL':
            if (parent === 'Link') {
              if (isActive(node.from)) decos.push(mark('cm-url').range(node.from, node.to))
              else decos.push(hidden.range(node.from, node.to))
            }
            return
          case 'LinkTitle':
            if (parent === 'Link') hideOrDim(node.from - 1, node.to)
            return
          case 'Image': {
            const m = IMAGE_RE.exec(state.sliceDoc(node.from, node.to))
            if (!m) return
            const widget = new ImageWidget(opts.resolveImage(m[2] ?? ''), m[1] ?? '')
            if (isActive(node.from)) {
              decos.push(mark('cm-url').range(node.from, node.to))
              decos.push(Decoration.widget({ widget, side: 1 }).range(node.to))
            } else {
              decos.push(Decoration.replace({ widget }).range(node.from, node.to))
            }
            return false
          }
          case 'Blockquote':
            eachLine(node.from, node.to, (l) => decos.push(line('cm-quote').range(l)))
            return
          case 'QuoteMark':
            hideOrDim(node.from, followingSpace(node.to))
            return
          case 'ListMark': {
            const isTask = node.node.nextSibling?.name === 'Task'
            const bullet = node.node.parent?.parent?.name === 'BulletList'
            if (isActive(node.from)) return
            if (isTask) decos.push(hidden.range(node.from, followingSpace(node.to)))
            else if (bullet) decos.push(Decoration.replace({ widget: new BulletWidget() }).range(node.from, node.to))
            return
          }
          case 'TaskMarker': {
            const checked = /x/i.test(state.sliceDoc(node.from, node.to))
            if (!isActive(node.from)) {
              decos.push(Decoration.replace({ widget: new TaskWidget(checked) }).range(node.from, node.to))
            }
            if (checked) {
              const end = doc.lineAt(node.from).to
              if (node.to + 1 < end) decos.push(mark('cm-task-done').range(node.to + 1, end))
            }
            return
          }
          case 'HorizontalRule':
            if (!isActive(node.from)) {
              decos.push(Decoration.replace({ widget: new RuleWidget() }).range(node.from, node.to))
            }
            return
          case 'FencedCode':
            eachLine(node.from, node.to, (l, first, last) =>
              decos.push(
                line(['cm-codeblock', first && 'cm-codeblock-first', last && 'cm-codeblock-last'].filter(Boolean).join(' ')).range(l),
              ),
            )
            return
          case 'Table':
            eachLine(node.from, node.to, (l) => decos.push(line('cm-table').range(l)))
            return false
        }
        return
      },
    })
  }
  return Decoration.set(decos, true)
}

function toggleTask(view: EditorView, target: HTMLElement): boolean {
  const pos = view.posAtDOM(target)
  const text = view.state.sliceDoc(pos, pos + 3)
  if (!/^\[[ xX]\]$/.test(text)) return false
  view.dispatch({ changes: { from: pos + 1, to: pos + 2, insert: text[1] === ' ' ? 'x' : ' ' } })
  return true
}

export function livePreview(opts: LivePreviewOptions) {
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet
        constructor(view: EditorView) {
          this.decorations = build(view, opts)
        }
        update(u: ViewUpdate) {
          if (u.docChanged || u.selectionSet || u.viewportChanged || u.focusChanged || treeChanged(u)) {
            this.decorations = build(u.view, opts)
          }
        }
      },
      { decorations: (v) => v.decorations },
    ),
    EditorView.domEventHandlers({
      mousedown(event, view) {
        const target = event.target as HTMLElement
        if (target.classList.contains('cm-task')) {
          event.preventDefault()
          return toggleTask(view, target)
        }
        return false
      },
    }),
  ]
}

// O parser do markdown roda em pedacos; quando termina um, a arvore muda sem o
// documento mudar, e as decoracoes precisam acompanhar.
function treeChanged(u: ViewUpdate) {
  return syntaxTree(u.startState as EditorState) !== syntaxTree(u.state)
}
