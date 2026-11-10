import type { FontToken, Tokens } from './schema.ts'

export function tokenVar(prefix: string, name: string): string {
  const key = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `--${prefix}-${key || 'x'}`
}

export function fontStack(font: FontToken): string {
  const family = /^[\w-]+$/.test(font.family) ? font.family : `"${font.family}"`
  return font.fallback ? `${family}, ${font.fallback}` : family
}

export function googleFontUrl(font: FontToken): string {
  const family = font.family.trim().replace(/\s+/g, '+')
  const weights = [...new Set(font.weights ?? [])].sort((a, b) => a - b)
  const spec = weights.length ? `${family}:wght@${weights.join(';')}` : family
  return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`
}

/**
 * Um `@import` por familia: o Google Fonts recusa o pedido inteiro quando um
 * peso nao existe, e assim uma fonte errada nao derruba as outras.
 */
export function tokensToCss(tokens: Tokens): string {
  const imports = tokens.fonts
    .filter((f) => (f.source ?? 'google') === 'google')
    .map((f) => `@import url("${googleFontUrl(f)}");`)

  const lines: string[] = []
  const block = (title: string, entries: [string, string][]) => {
    if (!entries.length) return
    lines.push(`  /* ${title} */`)
    for (const [k, v] of entries) lines.push(`  ${k}: ${v};`)
  }
  block('cores', tokens.colors.map((c) => [tokenVar('color', c.name), c.value]))
  block('fontes', tokens.fonts.map((f) => [tokenVar('font', f.name), fontStack(f)]))
  block('raios', tokens.radii.map((r) => [tokenVar('radius', r.name), r.value]))
  block('espacos', tokens.spacing.map((s) => [tokenVar('space', s.name), s.value]))
  block('sombras', tokens.shadows.map((s) => [tokenVar('shadow', s.name), s.value]))

  return [
    '/* Gerado pelo mocha a partir de tokens.json. Edite o json, nao este arquivo. */',
    ...imports,
    imports.length ? '' : null,
    ':root {',
    ...lines,
    '}',
    '',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

export const EMPTY_TOKENS: Tokens = { colors: [], fonts: [], radii: [], spacing: [], shadows: [] }
