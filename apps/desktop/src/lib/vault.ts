import { QueryClient, useQuery } from '@tanstack/react-query'
import { create } from 'zustand'
import { Vault, blendDir, slugFromPath } from '@mocha/core'
import { backend } from './backend'

export const vault = new Vault(backend.fs)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: Infinity, retry: false, refetchOnWindowFocus: false },
  },
})

// Chaves: tudo de uma ideia comeca com ['idea', slug], e assim um evento do
// watcher invalida a ideia inteira de uma vez.
export const keys = {
  ideas: ['ideas'] as const,
  idea: (slug: string) => ['idea', slug] as const,
  topics: (slug: string) => ['idea', slug, 'topics'] as const,
  blends: (slug: string) => ['idea', slug, 'blends'] as const,
  tokens: (slug: string, v: number) => ['idea', slug, 'blend', v, 'tokens'] as const,
  assets: (slug: string, v: number) => ['idea', slug, 'blend', v, 'assets'] as const,
}

export const useIdeas = () => useQuery({ queryKey: keys.ideas, queryFn: () => vault.listIdeas() })
export const useIdea = (slug: string) => useQuery({ queryKey: keys.idea(slug), queryFn: () => vault.getIdea(slug) })
export const useTopics = (slug: string) =>
  useQuery({ queryKey: keys.topics(slug), queryFn: () => vault.listTopics(slug) })
export const useBlends = (slug: string) =>
  useQuery({ queryKey: keys.blends(slug), queryFn: () => vault.listBlends(slug) })
export const useTokens = (slug: string, v: number) =>
  useQuery({ queryKey: keys.tokens(slug, v), queryFn: () => vault.readTokens(slug, v) })
export const useBlendAssets = (slug: string, v: number) =>
  useQuery({ queryKey: keys.assets(slug, v), queryFn: () => vault.listBlendAssets(slug, v) })

/**
 * Contador por pasta de versao: cada mudanca la dentro troca a URL dos iframes
 * e recarrega o blend na tela, inclusive quando quem escreveu foi um agente.
 */
interface Ticks {
  ticks: Record<string, number>
  bump(dirs: string[]): void
}
export const useTicks = create<Ticks>((set) => ({
  ticks: {},
  bump: (dirs) =>
    set((s) => {
      const ticks = { ...s.ticks }
      for (const d of dirs) ticks[d] = (ticks[d] ?? 0) + 1
      return { ticks }
    }),
}))

export const useBlendTick = (slug: string, version: number) =>
  useTicks((s) => s.ticks[blendDir(slug, version)] ?? 0)

type Listener = (paths: string[]) => void
const listeners = new Set<Listener>()

/** Para quem precisa do caminho exato (o editor, para recarregar o arquivo aberto). */
export function onVaultChange(cb: Listener) {
  listeners.add(cb)
  return () => void listeners.delete(cb)
}

export function startVaultSync() {
  return backend.onChange((paths) => {
    const slugs = new Set<string>()
    const dirs = new Set<string>()
    for (const p of paths) {
      const slug = slugFromPath(p)
      if (slug) slugs.add(slug)
      const m = /^(ideias\/[^/]+\/blends\/v\d+)(\/|$)/.exec(p)
      if (m?.[1]) dirs.add(m[1])
    }
    if (slugs.size || paths.some((p) => p === 'ideias')) {
      void queryClient.invalidateQueries({ queryKey: keys.ideas })
    }
    for (const slug of slugs) void queryClient.invalidateQueries({ queryKey: keys.idea(slug) })
    if (dirs.size) useTicks.getState().bump([...dirs])
    for (const l of listeners) l(paths)
  })
}
