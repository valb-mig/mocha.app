import { joinPath } from './fs.ts'

/** Mesmo `identifier` do tauri.conf.json: o MCP acha a config do app por ele. */
export const APP_IDENTIFIER = 'app.mocha.desktop'

export const IDEAS_DIR = 'ideias'
export const TRASH_DIR = '.lixeira'

export const ideaDir = (slug: string) => joinPath(IDEAS_DIR, slug)
export const ideaMetaPath = (slug: string) => joinPath(ideaDir(slug), 'ideia.json')
export const briefingDir = (slug: string) => joinPath(ideaDir(slug), 'briefing')
export const briefingAssetsDir = (slug: string) => joinPath(briefingDir(slug), 'assets')
export const topicPath = (slug: string, title: string) => joinPath(briefingDir(slug), `${title}.md`)
export const blendsDir = (slug: string) => joinPath(ideaDir(slug), 'blends')
export const blendDir = (slug: string, version: number) => joinPath(blendsDir(slug), `v${version}`)
export const blendMetaPath = (slug: string, version: number) => joinPath(blendDir(slug, version), 'blend.json')
export const tokensPath = (slug: string, version: number) => joinPath(blendDir(slug, version), 'tokens.json')
export const tokensCssPath = (slug: string, version: number) => joinPath(blendDir(slug, version), 'tokens.css')
export const notesPath = (slug: string, version: number) => joinPath(blendDir(slug, version), 'notas.md')
export const blendAssetsDir = (slug: string, version: number) => joinPath(blendDir(slug, version), 'assets')

/** `ideias/<slug>/...` -> slug. Usado para saber o que um evento do watcher tocou. */
export function slugFromPath(path: string): string | null {
  const [root, slug] = path.split('/')
  return root === IDEAS_DIR && slug ? slug : null
}

export function parseVersionDir(name: string): number | null {
  const m = /^v(\d+)$/.exec(name)
  return m ? Number(m[1]) : null
}

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif']
export const FONT_EXTS = ['woff2', 'woff', 'ttf', 'otf']
