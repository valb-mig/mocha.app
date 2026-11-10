/**
 * O que o vault precisa do disco. Caminhos sao relativos a raiz do vault, com
 * `/`, e nunca sobem (`..`). O app implementa isto por comandos do Tauri e o
 * MCP por `node:fs`, e a logica do vault fica uma so para os dois.
 */
export interface Entry {
  name: string
  dir: boolean
  /** ms desde epoch */
  mtime: number
  size: number
}

export interface VaultFs {
  readText(path: string): Promise<string>
  readBytes(path: string): Promise<Uint8Array>
  /** Cria as pastas que faltarem. */
  writeText(path: string, content: string): Promise<void>
  writeBytes(path: string, data: Uint8Array): Promise<void>
  /** Pasta que nao existe devolve lista vazia. */
  list(path: string): Promise<Entry[]>
  exists(path: string): Promise<boolean>
  mkdir(path: string): Promise<void>
  rename(from: string, to: string): Promise<void>
  /** Recursivo. */
  copy(from: string, to: string): Promise<void>
  /** Recursivo. */
  remove(path: string): Promise<void>
}

export function joinPath(...parts: string[]): string {
  return parts
    .flatMap((p) => p.split('/'))
    .filter((p) => p !== '' && p !== '.')
    .join('/')
}

/** Junta `rel` a `base` recusando qualquer coisa que saia de `base`. */
export function safeJoin(base: string, rel: string): string {
  const clean = rel.replace(/\\/g, '/')
  if (clean.startsWith('/') || /^[a-zA-Z]:/.test(clean)) {
    throw new Error(`caminho absoluto nao permitido: ${rel}`)
  }
  const segments = clean.split('/').filter((s) => s !== '' && s !== '.')
  if (segments.some((s) => s === '..')) {
    throw new Error(`caminho nao pode subir de pasta: ${rel}`)
  }
  if (segments.length === 0) throw new Error('caminho vazio')
  return joinPath(base, ...segments)
}

export function extname(path: string): string {
  const name = path.split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function basename(path: string, ext?: string): string {
  const name = path.split('/').pop() ?? ''
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name
}
