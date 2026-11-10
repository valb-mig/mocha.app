export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function slugify(text: string): string {
  const slug = normalize(text)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
  return slug || 'ideia'
}

/** Nome de arquivo valido em Linux, macOS e Windows, mantendo acento e espaco. */
export function safeFileName(text: string): string {
  const name = text
    .replace(/[/\\:*?"<>|\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '')
    .slice(0, 120)
  return name || 'Sem título'
}

export function uniqueName(base: string, taken: Set<string>, sep = ' '): string {
  if (!taken.has(base)) return base
  for (let i = 2; ; i++) {
    const name = `${base}${sep}${i}`
    if (!taken.has(name)) return name
  }
}
