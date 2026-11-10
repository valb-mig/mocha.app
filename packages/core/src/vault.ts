import { basename, extname, joinPath, safeJoin, type Entry, type VaultFs } from './fs.ts'
import {
  IDEAS_DIR,
  IMAGE_EXTS,
  FONT_EXTS,
  TRASH_DIR,
  blendAssetsDir,
  blendDir,
  blendMetaPath,
  blendsDir,
  briefingAssetsDir,
  briefingDir,
  ideaDir,
  ideaMetaPath,
  notesPath,
  parseVersionDir,
  tokensCssPath,
  tokensPath,
  topicPath,
} from './paths.ts'
import {
  BlendMetaSchema,
  IdeaMetaSchema,
  TokensSchema,
  type Asset,
  type BlendMeta,
  type BlendVersion,
  type IdeaMatch,
  type IdeaMeta,
  type IdeaSummary,
  type Screen,
  type Tokens,
  type Topic,
} from './schema.ts'
import { normalize, safeFileName, slugify, uniqueName } from './slug.ts'
import { EMPTY_TOKENS, tokensToCss } from './tokens.ts'
import { STARTER_TOKENS, starterScreen } from './template.ts'

const now = () => new Date().toISOString()
const stamp = () => now().replace(/[:.]/g, '-')
const DEFAULT_TOPIC = 'Visão geral'

export interface RecursiveFile {
  /** relativo a pasta listada */
  file: string
  path: string
  size: number
  mtime: number
}

export class Vault {
  readonly fs: VaultFs

  constructor(fs: VaultFs) {
    this.fs = fs
  }

  async init(): Promise<void> {
    await this.fs.mkdir(IDEAS_DIR)
  }

  // ---------------------------------------------------------------- ideias

  async listIdeas(): Promise<IdeaSummary[]> {
    const entries = await this.fs.list(IDEAS_DIR)
    const ideas = await Promise.all(
      entries
        .filter((e) => e.dir && !e.name.startsWith('.'))
        .map((e) => this.getIdea(e.name).catch(() => null)),
    )
    return ideas
      .filter((i): i is IdeaSummary => i !== null)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async getIdea(slug: string): Promise<IdeaSummary> {
    const [meta, topics, blends] = await Promise.all([
      this.readMeta(slug),
      this.listTopics(slug),
      this.listBlends(slug),
    ])
    // Agente que edita os arquivos direto nao mexe no ideia.json, entao a data
    // de edicao tambem olha o disco.
    const mtimes = [...topics.map((t) => t.mtime), ...blends.map((b) => b.updatedAt)]
    const diskUpdated = mtimes.length ? new Date(Math.max(...mtimes)).toISOString() : meta.updatedAt
    const latest = blends[0]
    const first = latest?.screens[0]
    return {
      slug,
      name: meta.name,
      createdAt: meta.createdAt,
      updatedAt: diskUpdated > meta.updatedAt ? diskUpdated : meta.updatedAt,
      topicCount: topics.length,
      versions: blends.map((b) => b.version),
      cover: latest && first ? { version: latest.version, path: first.path } : null,
    }
  }

  async readMeta(slug: string): Promise<IdeaMeta> {
    const path = ideaMetaPath(slug)
    if (!(await this.fs.exists(path))) {
      if (!(await this.fs.exists(ideaDir(slug)))) throw new Error(`ideia nao encontrada: ${slug}`)
      const t = now()
      return { name: slug, createdAt: t, updatedAt: t, topics: [] }
    }
    const parsed = IdeaMetaSchema.safeParse(JSON.parse(await this.fs.readText(path)))
    if (!parsed.success) throw new Error(`ideia.json invalido em ${slug}`)
    return parsed.data
  }

  private async writeMeta(slug: string, meta: IdeaMeta): Promise<void> {
    await this.fs.writeText(ideaMetaPath(slug), JSON.stringify(meta, null, 2) + '\n')
  }

  private async patchMeta(slug: string, patch: (m: IdeaMeta) => IdeaMeta): Promise<IdeaMeta> {
    const meta = patch(await this.readMeta(slug))
    meta.updatedAt = now()
    await this.writeMeta(slug, meta)
    return meta
  }

  async createIdea(name: string): Promise<IdeaSummary> {
    const clean = name.trim() || 'Nova ideia'
    const taken = new Set((await this.fs.list(IDEAS_DIR)).map((e) => e.name))
    const slug = uniqueName(slugify(clean), taken, '-')
    const t = now()
    await this.writeMeta(slug, { name: clean, createdAt: t, updatedAt: t, topics: [DEFAULT_TOPIC] })
    await this.fs.writeText(topicPath(slug, DEFAULT_TOPIC), '')
    await this.fs.mkdir(blendsDir(slug))
    return this.getIdea(slug)
  }

  async renameIdea(slug: string, name: string): Promise<void> {
    const clean = name.trim()
    if (!clean) return
    await this.patchMeta(slug, (m) => ({ ...m, name: clean }))
  }

  /** Nada se apaga de vez: vai para `.lixeira/` dentro do vault. */
  async trashIdea(slug: string): Promise<void> {
    await this.fs.rename(ideaDir(slug), joinPath(TRASH_DIR, `${stamp()}-${slug}`))
  }

  // -------------------------------------------------------------- briefing

  async listTopics(slug: string): Promise<Topic[]> {
    const [meta, entries] = await Promise.all([this.readMeta(slug), this.fs.list(briefingDir(slug))])
    const files = new Map<string, Entry>()
    for (const e of entries) {
      if (!e.dir && extname(e.name) === 'md') files.set(basename(e.name, '.md'), e)
    }
    const ordered = meta.topics.filter((t) => files.has(t))
    const rest = [...files.keys()].filter((t) => !ordered.includes(t)).sort((a, b) => a.localeCompare(b))
    return [...ordered, ...rest].map((title) => ({
      title,
      path: topicPath(slug, title),
      mtime: files.get(title)!.mtime,
    }))
  }

  readTopic(slug: string, title: string): Promise<string> {
    return this.fs.readText(topicPath(slug, title))
  }

  async writeTopic(slug: string, title: string, content: string): Promise<Topic> {
    const clean = safeFileName(title)
    const path = topicPath(slug, clean)
    const existed = await this.fs.exists(path)
    await this.fs.writeText(path, content)
    await this.patchMeta(slug, (m) => ({
      ...m,
      topics: existed || m.topics.includes(clean) ? m.topics : [...m.topics, clean],
    }))
    return { title: clean, path, mtime: Date.now() }
  }

  async createTopic(slug: string, title = 'Sem título'): Promise<Topic> {
    const taken = new Set((await this.listTopics(slug)).map((t) => t.title))
    const unique = uniqueName(safeFileName(title), taken)
    return this.writeTopic(slug, unique, '')
  }

  async renameTopic(slug: string, from: string, to: string): Promise<string> {
    const clean = safeFileName(to)
    if (clean === from) return from
    const taken = new Set((await this.listTopics(slug)).map((t) => t.title).filter((t) => t !== from))
    const unique = uniqueName(clean, taken)
    await this.fs.rename(topicPath(slug, from), topicPath(slug, unique))
    await this.patchMeta(slug, (m) => {
      const topics = m.topics.includes(from) ? m.topics.map((t) => (t === from ? unique : t)) : [...m.topics, unique]
      return { ...m, topics }
    })
    return unique
  }

  async reorderTopics(slug: string, titles: string[]): Promise<void> {
    await this.patchMeta(slug, (m) => ({ ...m, topics: titles }))
  }

  async trashTopic(slug: string, title: string): Promise<void> {
    await this.fs.rename(topicPath(slug, title), joinPath(TRASH_DIR, `${stamp()}-${slug}`, `${title}.md`))
    await this.patchMeta(slug, (m) => ({ ...m, topics: m.topics.filter((t) => t !== title) }))
  }

  /** Salva a imagem e devolve o caminho relativo ao `.md`, que e o que vai no markdown. */
  saveBriefingAsset(slug: string, fileName: string, data: Uint8Array): Promise<string> {
    return this.saveAsset(briefingAssetsDir(slug), fileName, data)
  }

  /** Em `assets/` da versao, para imagens coladas nas notas. */
  saveBlendAsset(slug: string, version: number, fileName: string, data: Uint8Array): Promise<string> {
    return this.saveAsset(blendAssetsDir(slug, version), fileName, data)
  }

  /** Grava em `dir` com nome sem colisao e devolve `assets/<nome>`. */
  private async saveAsset(dir: string, fileName: string, data: Uint8Array): Promise<string> {
    const ext = extname(fileName) || 'png'
    const base = slugify(basename(fileName, `.${ext}`)).slice(0, 40) || 'imagem'
    const taken = new Set((await this.fs.list(dir)).map((e) => e.name))
    let name = `${base}.${ext}`
    for (let i = 2; taken.has(name); i++) name = `${base}-${i}.${ext}`
    await this.fs.writeBytes(joinPath(dir, name), data)
    return `assets/${name}`
  }

  async briefingMarkdown(slug: string): Promise<string> {
    const topics = await this.listTopics(slug)
    const parts = await Promise.all(
      topics.map(async (t) => `## ${t.title}\n\n${(await this.readTopic(slug, t.title)).trim()}\n`),
    )
    return parts.join('\n')
  }

  // ---------------------------------------------------------------- blends

  async listBlends(slug: string): Promise<BlendVersion[]> {
    const entries = await this.fs.list(blendsDir(slug))
    const versions = entries
      .filter((e) => e.dir)
      .map((e) => parseVersionDir(e.name))
      .filter((v): v is number => v !== null)
    const blends = await Promise.all(versions.map((v) => this.getBlend(slug, v)))
    return blends.sort((a, b) => b.version - a.version)
  }

  async getBlend(slug: string, version: number): Promise<BlendVersion> {
    const dir = blendDir(slug, version)
    const entries = await this.fs.list(dir)
    if (!entries.length && !(await this.fs.exists(dir))) throw new Error(`versao v${version} nao existe`)
    const meta = await this.readBlendMeta(slug, version, entries)
    const html = entries.filter((e) => !e.dir && extname(e.name) === 'html')
    const screens: Screen[] = await Promise.all(
      html.map(async (e) => {
        const path = joinPath(dir, e.name)
        return { file: e.name, path, title: await this.screenTitle(path, e.name) }
      }),
    )
    screens.sort((a, b) =>
      a.file === 'index.html' ? -1 : b.file === 'index.html' ? 1 : a.file.localeCompare(b.file),
    )
    return {
      version,
      path: dir,
      createdAt: meta.createdAt,
      basedOn: meta.basedOn,
      screens,
      updatedAt: Math.max(0, ...entries.map((e) => e.mtime)),
    }
  }

  private async readBlendMeta(slug: string, version: number, entries: Entry[]): Promise<BlendMeta> {
    const path = blendMetaPath(slug, version)
    if (entries.some((e) => e.name === 'blend.json')) {
      const parsed = BlendMetaSchema.safeParse(JSON.parse(await this.fs.readText(path)))
      if (parsed.success) return parsed.data
    }
    const oldest = Math.min(Date.now(), ...entries.map((e) => e.mtime))
    return { createdAt: new Date(oldest).toISOString() }
  }

  private async screenTitle(path: string, file: string): Promise<string> {
    try {
      const head = (await this.fs.readText(path)).slice(0, 4000)
      const m = /<title[^>]*>([^<]*)<\/title>/i.exec(head)
      const title = m?.[1]?.trim()
      if (title) return decodeEntities(title)
    } catch {
      /* cai no nome do arquivo */
    }
    return basename(file, '.html')
  }

  /**
   * Nova versao. Sem `from`, copia a mais nova; com `from: 'empty'` (ou sem
   * nenhuma versao ainda), comeca do modelo.
   */
  async createBlend(slug: string, opts: { from?: number | 'empty'; notes?: string } = {}): Promise<BlendVersion> {
    const existing = await this.listBlends(slug)
    const next = (existing[0]?.version ?? 0) + 1
    const from = opts.from === 'empty' ? undefined : (opts.from ?? existing[0]?.version)
    const dir = blendDir(slug, next)

    if (from !== undefined) {
      if (!existing.some((b) => b.version === from)) throw new Error(`versao v${from} nao existe`)
      await this.fs.copy(blendDir(slug, from), dir)
    } else {
      const meta = await this.readMeta(slug)
      await this.writeTokens(slug, next, STARTER_TOKENS)
      await this.fs.writeText(joinPath(dir, 'index.html'), starterScreen(meta.name))
    }
    const blendMeta: BlendMeta = { createdAt: now(), ...(from !== undefined ? { basedOn: from } : {}) }
    await this.fs.writeText(blendMetaPath(slug, next), JSON.stringify(blendMeta, null, 2) + '\n')
    await this.fs.writeText(notesPath(slug, next), opts.notes ?? '')
    await this.patchMeta(slug, (m) => m)
    return this.getBlend(slug, next)
  }

  async trashBlend(slug: string, version: number): Promise<void> {
    await this.fs.rename(blendDir(slug, version), joinPath(TRASH_DIR, `${stamp()}-${slug}-v${version}`))
  }

  async readTokens(slug: string, version: number): Promise<Tokens> {
    const path = tokensPath(slug, version)
    if (!(await this.fs.exists(path))) return EMPTY_TOKENS
    const parsed = TokensSchema.safeParse(JSON.parse(await this.fs.readText(path)))
    if (!parsed.success) throw new Error(`tokens.json invalido: ${parsed.error.issues[0]?.message ?? ''}`)
    return parsed.data
  }

  async writeTokens(slug: string, version: number, tokens: Tokens): Promise<Tokens> {
    const clean = TokensSchema.parse(tokens)
    await this.fs.writeText(tokensPath(slug, version), JSON.stringify(clean, null, 2) + '\n')
    await this.fs.writeText(tokensCssPath(slug, version), tokensToCss(clean))
    return clean
  }

  readBlendFile(slug: string, version: number, file: string): Promise<string> {
    return this.fs.readText(safeJoin(blendDir(slug, version), file))
  }

  /** `tokens.json` passa pela validacao e regenera o `tokens.css`. */
  async writeBlendFile(slug: string, version: number, file: string, content: string): Promise<string> {
    const path = safeJoin(blendDir(slug, version), file)
    if (!(await this.fs.exists(blendDir(slug, version)))) throw new Error(`versao v${version} nao existe`)
    if (path === tokensPath(slug, version)) {
      await this.writeTokens(slug, version, TokensSchema.parse(JSON.parse(content)))
    } else {
      await this.fs.writeText(path, content)
    }
    return path
  }

  async listBlendFiles(slug: string, version: number): Promise<RecursiveFile[]> {
    return this.walk(blendDir(slug, version))
  }

  async listBlendAssets(slug: string, version: number): Promise<Asset[]> {
    const files = await this.walk(blendDir(slug, version))
    return files
      .map((f) => ({ file: f.file, path: f.path, ext: extname(f.file), size: f.size }))
      .filter((f) => IMAGE_EXTS.includes(f.ext) || FONT_EXTS.includes(f.ext))
  }

  async readNotes(slug: string, version: number): Promise<string> {
    const path = notesPath(slug, version)
    return (await this.fs.exists(path)) ? this.fs.readText(path) : ''
  }

  writeNotes(slug: string, version: number, content: string): Promise<void> {
    return this.fs.writeText(notesPath(slug, version), content)
  }

  private async walk(dir: string, prefix = ''): Promise<RecursiveFile[]> {
    const entries = await this.fs.list(prefix ? joinPath(dir, prefix) : dir)
    const nested = await Promise.all(
      entries.map(async (e): Promise<RecursiveFile[]> => {
        const rel = prefix ? `${prefix}/${e.name}` : e.name
        if (e.dir) return this.walk(dir, rel)
        return [{ file: rel, path: joinPath(dir, rel), size: e.size, mtime: e.mtime }]
      }),
    )
    return nested.flat().sort((a, b) => a.file.localeCompare(b.file))
  }

  // ----------------------------------------------------------------- busca

  async search(query: string): Promise<IdeaMatch[]> {
    const q = normalize(query)
    if (!q) return []
    const words = q.split(/\s+/)
    const ideas = await this.listIdeas()
    const matches = await Promise.all(
      ideas.map(async (idea): Promise<IdeaMatch | null> => {
        const name = normalize(idea.name)
        const base = { slug: idea.slug, name: idea.name }
        if (name === q || idea.slug === q) return { ...base, score: 100 }
        if (name.startsWith(q)) return { ...base, score: 85 }
        if (name.includes(q) || idea.slug.includes(slugify(q))) return { ...base, score: 70 }
        if (words.every((w) => name.includes(w))) return { ...base, score: 60 }
        const topics = await this.listTopics(idea.slug)
        const topic = topics.find((t) => normalize(t.title).includes(q))
        if (topic) return { ...base, score: 40, hit: `topico "${topic.title}"` }
        for (const t of topics) {
          const text = await this.readTopic(idea.slug, t.title)
          const at = normalize(text).indexOf(q)
          if (at >= 0) {
            const snippet = text.slice(Math.max(0, at - 40), at + q.length + 40).replace(/\s+/g, ' ')
            return { ...base, score: 25, hit: `"…${snippet}…" em ${t.title}` }
          }
        }
        return null
      }),
    )
    return matches.filter((m): m is IdeaMatch => m !== null).sort((a, b) => b.score - a.score)
  }

  /** Aceita slug, nome exato ou um pedaco do nome, desde que nao seja ambiguo. */
  async resolveIdea(ref: string): Promise<string> {
    if (await this.fs.exists(ideaDir(ref.trim()))) return ref.trim()
    const matches = await this.search(ref)
    const [top, second] = matches
    if (top && top.score >= 60 && (!second || top.score > second.score)) return top.slug
    if (!matches.length) throw new Error(`nenhuma ideia encontrada para "${ref}"`)
    const list = matches.slice(0, 5).map((m) => `${m.name} (${m.slug})`).join(', ')
    throw new Error(`"${ref}" e ambiguo. Candidatas: ${list}`)
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
}
