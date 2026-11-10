import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { TokensSchema, Vault, blendDir, briefingDir, ideaDir, type BlendVersion } from '@mocha/core'
import { nodeFs, resolveVaultPath } from '@mocha/core/node'

const root = await resolveVaultPath()
const vault = new Vault(nodeFs(root))
await vault.init()

const abs = (rel: string) => path.join(root, rel)

const INSTRUCTIONS = `
mocha.app organiza design de aplicacoes web por ideia. Tudo e arquivo real no vault ${root}.

Estrutura de uma ideia (ideias/<slug>/):
- briefing/*.md: topicos do briefing escritos pelo usuario (referencias, publico, telas, regras). Imagens em briefing/assets/.
- blends/vN/: cada versao do blend, que e o design feito a partir do briefing.
  - *.html: uma tela por arquivo (index.html primeiro). O <title> vira o nome da tela no app.
  - tokens.json: paleta (colors), fontes (fonts), raios (radii), espacos (spacing), sombras (shadows).
  - tokens.css: GERADO a partir do tokens.json. Nunca edite a mao; use definir_tokens.
  - notas.md: o que mudou nesta versao.
  - assets/: svgs, imagens e fontes da versao.

Ao montar ou editar um blend:
- Cada HTML linka <link rel="stylesheet" href="tokens.css"> e usa so var(--color-*), var(--font-*),
  var(--radius-*), var(--space-*), var(--shadow-*). Nada de cor ou fonte solta no HTML.
  O nome do token vira a variavel: color "on-primary" -> --color-on-primary.
- HTML autocontido: CSS inline num <style>, sem build, sem framework. Pode usar JS pequeno inline.
- Layout de desktop, pensado pra ser reimplementado por outro agente noutra stack.
- Mudanca grande = versao nova (criar_blend copia a mais nova). Ajuste pequeno = editar a versao atual.
- Escreva em notas.md o que mudou e por que.

O usuario menciona ideias pelo nome no chat: use buscar_ideia ou passe o nome direto no parametro "ideia"
(aceita slug, nome ou um pedaco do nome). Nada aqui apaga arquivo; nao precisa pedir confirmacao.
`.trim()

const server = new McpServer({ name: 'mocha', version: '0.1.0' }, { instructions: INSTRUCTIONS })

function ok(data: unknown) {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  return { content: [{ type: 'text' as const, text }] }
}

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return { content: [{ type: 'text' as const, text: `Erro: ${message}` }], isError: true }
}

function tool<S extends z.ZodRawShape>(
  name: string,
  description: string,
  schema: S,
  annotations: { readOnlyHint: boolean; idempotentHint?: boolean },
  run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
) {
  server.registerTool(
    name,
    { description, inputSchema: schema, annotations: { destructiveHint: false, ...annotations } },
    // @ts-expect-error o generico do SDK nao fecha com o nosso, mas o shape e o mesmo
    async (args: z.infer<z.ZodObject<S>>) => {
      try {
        return ok(await run(args))
      } catch (error) {
        return fail(error)
      }
    },
  )
}

const ideia = z.string().describe('slug, nome ou parte do nome da ideia')
const versao = z.number().int().positive().optional().describe('numero da versao (v3 -> 3). Sem ela, a mais nova')

async function pickVersion(slug: string, version?: number): Promise<BlendVersion> {
  if (version !== undefined) return vault.getBlend(slug, version)
  const [latest] = await vault.listBlends(slug)
  if (!latest) throw new Error('esta ideia ainda nao tem blend. Use criar_blend.')
  return latest
}

function describeBlend(b: BlendVersion) {
  return {
    versao: b.version,
    pasta: abs(b.path),
    criado: b.createdAt,
    baseadoEm: b.basedOn,
    telas: b.screens.map((s) => ({ arquivo: s.file, titulo: s.title })),
  }
}

tool(
  'listar_ideias',
  'Lista as ideias do vault, da editada mais recentemente para a mais antiga.',
  {},
  { readOnlyHint: true },
  async () => {
    const ideas = await vault.listIdeas()
    return ideas.map((i) => ({
      slug: i.slug,
      nome: i.name,
      topicos: i.topicCount,
      versoes: i.versions.map((v) => `v${v}`),
      editada: i.updatedAt,
    }))
  },
)

tool(
  'buscar_ideia',
  'Acha ideias pelo nome, pelo titulo de um topico ou por texto do briefing. Use quando o usuario mencionar uma ideia no chat.',
  { consulta: z.string().min(1) },
  { readOnlyHint: true },
  async ({ consulta }) => {
    const matches = await vault.search(consulta)
    return matches.length ? matches.slice(0, 10) : `nenhuma ideia bate com "${consulta}"`
  },
)

tool(
  'ler_ideia',
  'Le a ideia inteira: briefing completo (todos os topicos em ordem), versoes do blend e caminhos no disco. Comece por aqui antes de criar ou mudar um blend.',
  { ideia },
  { readOnlyHint: true },
  async ({ ideia }) => {
    const slug = await vault.resolveIdea(ideia)
    const [summary, briefing, blends] = await Promise.all([
      vault.getIdea(slug),
      vault.briefingMarkdown(slug),
      vault.listBlends(slug),
    ])
    return [
      `# ${summary.name}`,
      `slug: ${slug}`,
      `pasta: ${abs(ideaDir(slug))}`,
      `imagens do briefing: ${abs(briefingDir(slug))}/assets/ (caminhos no markdown sao relativos a briefing/)`,
      `versoes: ${blends.map((b) => `v${b.version}`).join(', ') || 'nenhuma'}`,
      '',
      '# Briefing',
      '',
      briefing || '(vazio)',
    ].join('\n')
  },
)

tool(
  'criar_ideia',
  'Cria uma ideia nova com um topico "Visão geral" vazio.',
  { nome: z.string().min(1) },
  { readOnlyHint: false },
  async ({ nome }) => {
    const idea = await vault.createIdea(nome)
    return { slug: idea.slug, nome: idea.name, pasta: abs(ideaDir(idea.slug)) }
  },
)

tool(
  'escrever_topico',
  'Cria ou substitui um topico do briefing (markdown). O titulo vira o nome do arquivo.',
  { ideia, titulo: z.string().min(1), conteudo: z.string() },
  { readOnlyHint: false, idempotentHint: true },
  async ({ ideia, titulo, conteudo }) => {
    const slug = await vault.resolveIdea(ideia)
    const topic = await vault.writeTopic(slug, titulo, conteudo)
    return { titulo: topic.title, arquivo: abs(topic.path) }
  },
)

tool(
  'ler_blend',
  'Le uma versao do blend: telas (HTML completo), tokens, notas e lista de arquivos.',
  {
    ideia,
    versao,
    incluir_html: z.boolean().optional().describe('padrao true; false devolve so a lista de telas'),
  },
  { readOnlyHint: true },
  async ({ ideia, versao, incluir_html }) => {
    const slug = await vault.resolveIdea(ideia)
    const blend = await pickVersion(slug, versao)
    const [tokens, notes, files] = await Promise.all([
      vault.readTokens(slug, blend.version),
      vault.readNotes(slug, blend.version),
      vault.listBlendFiles(slug, blend.version),
    ])
    const screens =
      incluir_html === false
        ? undefined
        : await Promise.all(
            blend.screens.map(async (s) => ({
              arquivo: s.file,
              titulo: s.title,
              html: await vault.readBlendFile(slug, blend.version, s.file),
            })),
          )
    return {
      ...describeBlend(blend),
      notas: notes,
      tokens,
      arquivos: files.map((f) => f.file),
      ...(screens ? { html: screens } : {}),
    }
  },
)

tool(
  'criar_blend',
  'Cria a proxima versao do blend. Por padrao copia a versao mais nova (tokens, telas, assets); "a_partir_de": 0 comeca do modelo vazio.',
  {
    ideia,
    a_partir_de: z.number().int().min(0).optional().describe('versao de origem; 0 = modelo vazio'),
    notas: z.string().optional().describe('o que esta versao muda (vai para notas.md)'),
  },
  { readOnlyHint: false },
  async ({ ideia, a_partir_de, notas }) => {
    const slug = await vault.resolveIdea(ideia)
    const blend = await vault.createBlend(slug, {
      from: a_partir_de === 0 ? 'empty' : a_partir_de,
      notes: notas,
    })
    return describeBlend(blend)
  },
)

tool(
  'escrever_arquivo_blend',
  'Cria ou substitui um arquivo dentro de uma versao do blend: tela (.html), svg, css extra ou notas.md. Caminho relativo a pasta da versao, ex: "login.html", "assets/logo.svg". tokens.json e validado e regenera o tokens.css.',
  {
    ideia,
    versao,
    arquivo: z.string().min(1),
    conteudo: z.string(),
  },
  { readOnlyHint: false, idempotentHint: true },
  async ({ ideia, versao, arquivo, conteudo }) => {
    const slug = await vault.resolveIdea(ideia)
    const blend = await pickVersion(slug, versao)
    const written = await vault.writeBlendFile(slug, blend.version, arquivo, conteudo)
    return { versao: blend.version, arquivo: abs(written) }
  },
)

tool(
  'definir_tokens',
  'Substitui os tokens (paleta, fontes, raios, espacos, sombras) de uma versao e regenera o tokens.css. Mande o conjunto inteiro: o que nao vier some.',
  { ideia, versao, tokens: TokensSchema },
  { readOnlyHint: false, idempotentHint: true },
  async ({ ideia, versao, tokens }) => {
    const slug = await vault.resolveIdea(ideia)
    const blend = await pickVersion(slug, versao)
    const saved = await vault.writeTokens(slug, blend.version, tokens)
    return { versao: blend.version, pasta: abs(blendDir(slug, blend.version)), tokens: saved }
  },
)

await server.connect(new StdioServerTransport())
