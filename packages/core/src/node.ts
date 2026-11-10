import { promises as fsp } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { safeJoin, type Entry, type VaultFs } from './fs.ts'
import { APP_IDENTIFIER } from './paths.ts'

export function nodeFs(root: string): VaultFs {
  const abs = (p: string) => (p === '' ? root : path.join(root, safeJoin('', p)))
  const ensureParent = (p: string) => fsp.mkdir(path.dirname(abs(p)), { recursive: true })

  return {
    readText: (p) => fsp.readFile(abs(p), 'utf8'),
    readBytes: async (p) => new Uint8Array(await fsp.readFile(abs(p))),
    async writeText(p, content) {
      await ensureParent(p)
      await fsp.writeFile(abs(p), content, 'utf8')
    },
    async writeBytes(p, data) {
      await ensureParent(p)
      await fsp.writeFile(abs(p), data)
    },
    async list(p) {
      try {
        const dir = abs(p)
        const names = await fsp.readdir(dir)
        const entries = await Promise.all(
          names.map(async (name): Promise<Entry | null> => {
            try {
              const st = await fsp.stat(path.join(dir, name))
              return { name, dir: st.isDirectory(), mtime: st.mtimeMs, size: st.size }
            } catch {
              return null
            }
          }),
        )
        return entries.filter((e): e is Entry => e !== null)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw e
      }
    },
    exists: (p) => fsp.access(abs(p)).then(() => true, () => false),
    mkdir: async (p) => {
      await fsp.mkdir(abs(p), { recursive: true })
    },
    async rename(from, to) {
      await ensureParent(to)
      await fsp.rename(abs(from), abs(to))
    },
    copy: (from, to) => fsp.cp(abs(from), abs(to), { recursive: true, errorOnExist: true, force: false }),
    remove: (p) => fsp.rm(abs(p), { recursive: true, force: true }),
  }
}

export function configFilePath(): string {
  const home = os.homedir()
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_IDENTIFIER, 'config.json')
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), APP_IDENTIFIER, 'config.json')
  }
  return path.join(process.env.XDG_CONFIG_HOME ?? path.join(home, '.config'), APP_IDENTIFIER, 'config.json')
}

export const defaultVaultPath = () => path.join(os.homedir(), 'Mocha')

/** `MOCHA_VAULT` > pasta escolhida no app > `~/Mocha`. */
export async function resolveVaultPath(): Promise<string> {
  if (process.env.MOCHA_VAULT) return path.resolve(process.env.MOCHA_VAULT)
  try {
    const cfg = JSON.parse(await fsp.readFile(configFilePath(), 'utf8')) as { vault?: unknown }
    if (typeof cfg.vault === 'string' && cfg.vault) return cfg.vault
  } catch {
    /* sem config: padrao */
  }
  return defaultVaultPath()
}
