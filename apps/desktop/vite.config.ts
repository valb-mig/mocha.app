import { watch } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath } from 'node:url'
import tailwind from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { extname } from '@mocha/core'
import { nodeFs, resolveVaultPath } from '@mocha/core/node'

/**
 * `pnpm dev:web`: o app no navegador, sem Tauri, lendo o vault de verdade por
 * este servidor. Serve para iterar na interface e tirar screenshot. So liga com
 * MOCHA_WEB=1, e as rotas pedem um cabecalho proprio para que outra pagina
 * aberta no navegador nao consiga escrever no vault.
 */
function devVault(): Plugin {
  const MIME: Record<string, string> = {
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    avif: 'image/avif',
    woff2: 'font/woff2',
    woff: 'font/woff',
    ttf: 'font/ttf',
    otf: 'font/otf',
  }
  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => resolve(Buffer.concat(chunks)))
      req.on('error', reject)
    })

  return {
    name: 'mocha-dev-vault',
    apply: 'serve',
    async configureServer(server) {
      const root = await resolveVaultPath()
      const fs = nodeFs(root)
      await fs.mkdir('ideias')
      server.config.logger.info(`  mocha vault: ${root}`)

      const clients = new Set<ServerResponse>()
      let pending = new Set<string>()
      let timer: ReturnType<typeof setTimeout> | undefined
      watch(root, { recursive: true }, (_event, file) => {
        if (!file) return
        pending.add(String(file).replace(/\\/g, '/'))
        clearTimeout(timer)
        timer = setTimeout(() => {
          const data = JSON.stringify([...pending])
          pending = new Set()
          for (const c of clients) c.write(`data: ${data}\n\n`)
        }, 120)
      })

      server.middlewares.use('/__mocha/events', (req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
        res.write(':ok\n\n')
        clients.add(res)
        req.on('close', () => clients.delete(res))
      })

      server.middlewares.use('/__mocha/vault', async (req, res) => {
        const rel = decodeURIComponent((req.url ?? '/').split('?')[0] ?? '').replace(/^\/+/, '')
        try {
          let target = rel
          let data = await fs.readBytes(rel).catch(() => null)
          if (!data) {
            target = rel ? `${rel}/index.html` : 'index.html'
            data = await fs.readBytes(target)
          }
          res.setHeader('Content-Type', MIME[extname(target)] ?? 'application/octet-stream')
          res.setHeader('Cache-Control', 'no-store')
          res.end(Buffer.from(data))
        } catch {
          res.statusCode = 404
          res.end('nao encontrado')
        }
      })

      server.middlewares.use('/__mocha/api', async (req, res) => {
        if (req.headers['x-mocha-dev'] !== '1') {
          res.statusCode = 403
          res.end()
          return
        }
        const url = new URL(req.url ?? '/', 'http://localhost')
        const op = url.searchParams.get('op') ?? ''
        const body = await readBody(req)
        try {
          let result: unknown = null
          if (op === 'vault') {
            result = root
          } else if (op === 'writeBytes') {
            await fs.writeBytes(url.searchParams.get('path') ?? '', new Uint8Array(body))
          } else if (op === 'readBytes') {
            res.end(Buffer.from(await fs.readBytes(url.searchParams.get('path') ?? '')))
            return
          } else if (op in fs) {
            const args = JSON.parse(body.toString() || '[]') as unknown[]
            result = await (fs as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[op]!(...args)
          } else {
            throw new Error(`op desconhecida: ${op}`)
          }
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result ?? null))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwind(), process.env.MOCHA_WEB ? devVault() : null],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  build: { target: ['es2022', 'safari16'] },
})
