import { invoke, isTauri } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type { Entry, VaultFs } from '@mocha/core'

/**
 * Tudo que o app precisa do lado de fora da webview. No Tauri vai por comando;
 * no `pnpm dev:web` vai pelo servidor do Vite, para rodar no navegador.
 */
export interface Backend {
  fs: VaultFs
  getVault(): Promise<string | null>
  defaultVault(): Promise<string>
  setVault(path: string): Promise<string>
  pickFolder(): Promise<string | null>
  /** URL que carrega um arquivo do vault num <img>. */
  fileUrl(rel: string): string
  /** URL de uma tela de blend para iframe, com a origem presa a versao quando da. */
  frameUrl(rel: string): string
  /** `sandbox` do iframe que casa com a origem que `frameUrl` devolve. */
  frameSandbox: string
  onChange(cb: (paths: string[]) => void): () => void
  reveal(rel: string): Promise<void>
  mcpEntry(): Promise<string | null>
}

const encodePath = (rel: string) => rel.split('/').map(encodeURIComponent).join('/')
const BLEND_FILE = /^ideias\/([^/]+)\/blends\/v(\d+)\/(.+)$/

/** Slug em hex, em rotulos de ate 60 caracteres: qualquer nome de pasta vira host valido. */
function hexLabels(text: string): string {
  const hex = [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return hex.match(/.{1,60}/g)?.join('.') ?? ''
}

function tauriBackend(): Backend {
  const fs: VaultFs = {
    readText: (path) => invoke('fs_read_text', { path }),
    readBytes: async (path) => new Uint8Array(await invoke<ArrayBuffer>('fs_read_bytes', { path })),
    writeText: (path, content) => invoke('fs_write_text', { path, content }),
    writeBytes: (path, data) => invoke('fs_write_bytes', data, { headers: { 'x-path': encodeURIComponent(path) } }),
    list: (path) => invoke<Entry[]>('fs_list', { path }),
    exists: (path) => invoke('fs_exists', { path }),
    mkdir: (path) => invoke('fs_mkdir', { path }),
    rename: (from, to) => invoke('fs_rename', { from, to }),
    copy: (from, to) => invoke('fs_copy', { from, to }),
    remove: (path) => invoke('fs_remove', { path }),
  }
  // No Windows o WebView2 so aceita esquema proprio como http://<nome>.localhost,
  // sem host por versao: la o blend fica com a origem do vault inteiro.
  const windows = navigator.userAgent.includes('Windows')
  const base = windows ? 'http://mocha.localhost/' : 'mocha://localhost/'
  let vaultRoot: string | null = null

  return {
    fs,
    getVault: async () => (vaultRoot = await invoke<string | null>('vault_get')),
    defaultVault: () => invoke('vault_default'),
    setVault: async (path) => (vaultRoot = await invoke<string>('vault_set', { path })),
    async pickFolder() {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const picked = await open({ directory: true, multiple: false })
      return typeof picked === 'string' ? picked : null
    },
    fileUrl: (rel) => base + encodePath(rel),
    frameUrl(rel) {
      const m = BLEND_FILE.exec(rel)
      if (!m || windows) return base + encodePath(rel)
      return `mocha://v${m[2]}.${hexLabels(m[1]!)}/${encodePath(m[3]!)}`
    },
    // Origem diferente da do app, entao `allow-same-origin` nao abre o app ao
    // HTML do blend; sem ele o WebKitGTK nem carrega o tokens.css da tela.
    frameSandbox: 'allow-scripts allow-forms allow-same-origin',
    onChange(cb) {
      const off = listen<string[]>('vault:changed', (e) => cb(e.payload))
      return () => void off.then((f) => f())
    },
    async reveal(rel) {
      if (!vaultRoot) return
      const { revealItemInDir } = await import('@tauri-apps/plugin-opener')
      await revealItemInDir(rel ? `${vaultRoot}/${rel}` : vaultRoot)
    },
    mcpEntry: () => invoke<string | null>('mcp_entry'),
  }
}

function webBackend(): Backend {
  const call = async <T>(op: string, args: unknown[] = []): Promise<T> => {
    const res = await fetch(`/__mocha/api?op=${op}`, {
      method: 'POST',
      headers: { 'x-mocha-dev': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? res.statusText)
    return data as T
  }
  const fs: VaultFs = {
    readText: (p) => call('readText', [p]),
    async readBytes(p) {
      const res = await fetch(`/__mocha/api?op=readBytes&path=${encodeURIComponent(p)}`, {
        method: 'POST',
        headers: { 'x-mocha-dev': '1' },
      })
      return new Uint8Array(await res.arrayBuffer())
    },
    writeText: (p, c) => call('writeText', [p, c]),
    async writeBytes(p, data) {
      await fetch(`/__mocha/api?op=writeBytes&path=${encodeURIComponent(p)}`, {
        method: 'POST',
        headers: { 'x-mocha-dev': '1' },
        body: data as BodyInit,
      })
    },
    list: (p) => call('list', [p]),
    exists: (p) => call('exists', [p]),
    mkdir: (p) => call('mkdir', [p]),
    rename: (a, b) => call('rename', [a, b]),
    copy: (a, b) => call('copy', [a, b]),
    remove: (p) => call('remove', [p]),
  }
  return {
    fs,
    getVault: () => call('vault'),
    defaultVault: () => call('vault'),
    setVault: () => call('vault'),
    pickFolder: async () => null,
    fileUrl: (rel) => `/__mocha/vault/${encodePath(rel)}`,
    frameUrl: (rel) => `/__mocha/vault/${encodePath(rel)}`,
    // Aqui o iframe tem a mesma origem do app: `allow-same-origin` daria ao
    // blend acesso a pagina toda.
    frameSandbox: 'allow-scripts allow-forms',
    onChange(cb) {
      const source = new EventSource('/__mocha/events')
      source.onmessage = (e) => cb(JSON.parse(e.data))
      return () => source.close()
    },
    reveal: async () => {},
    mcpEntry: async () => null,
  }
}

export const backend: Backend = isTauri() ? tauriBackend() : webBackend()
