import { z } from 'zod'

export const IdeaMetaSchema = z.object({
  name: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Ordem dos topicos do briefing (titulo = nome do arquivo sem `.md`). */
  topics: z.array(z.string()).default([]),
})
export type IdeaMeta = z.infer<typeof IdeaMetaSchema>

export const BlendMetaSchema = z.object({
  createdAt: z.string(),
  /** Versao de onde esta foi copiada. */
  basedOn: z.number().int().positive().optional(),
})
export type BlendMeta = z.infer<typeof BlendMetaSchema>

const named = { name: z.string().min(1) }

export const ColorTokenSchema = z.object({
  ...named,
  value: z.string().min(1).describe('qualquer cor CSS: #hex, rgb(), oklch()...'),
  group: z.string().optional().describe('agrupa na aba Paleta, ex: "base", "acento", "estado"'),
})

export const FontTokenSchema = z.object({
  ...named,
  family: z.string().min(1).describe('nome da familia, ex: "Fraunces"'),
  fallback: z.string().optional().describe('ex: "serif", "system-ui, sans-serif"'),
  weights: z.array(z.number().int()).optional(),
  source: z
    .enum(['google', 'local', 'system'])
    .optional()
    .describe('google: importa do Google Fonts; local: arquivo em assets/fonts; system: nao importa nada'),
  sample: z.string().optional().describe('frase de amostra na aba Fontes'),
})

export const SizeTokenSchema = z.object({ ...named, value: z.string().min(1) })

export const TokensSchema = z.object({
  colors: z.array(ColorTokenSchema).default([]),
  fonts: z.array(FontTokenSchema).default([]),
  radii: z.array(SizeTokenSchema).default([]),
  spacing: z.array(SizeTokenSchema).default([]),
  shadows: z.array(SizeTokenSchema).default([]),
})
export type Tokens = z.infer<typeof TokensSchema>
export type ColorToken = z.infer<typeof ColorTokenSchema>
export type FontToken = z.infer<typeof FontTokenSchema>
export type SizeToken = z.infer<typeof SizeTokenSchema>

export interface IdeaSummary {
  slug: string
  name: string
  createdAt: string
  updatedAt: string
  topicCount: number
  versions: number[]
  /** Tela usada de capa: a primeira da versao mais nova. */
  cover: { version: number; path: string } | null
}

export interface Topic {
  title: string
  path: string
  mtime: number
}

export interface Screen {
  file: string
  title: string
  path: string
}

export interface Asset {
  file: string
  path: string
  ext: string
  size: number
}

export interface BlendVersion {
  version: number
  path: string
  createdAt: string
  basedOn?: number
  screens: Screen[]
  updatedAt: number
}

export interface IdeaMatch {
  slug: string
  name: string
  score: number
  /** Onde bateu, quando nao foi no nome. */
  hit?: string
}
