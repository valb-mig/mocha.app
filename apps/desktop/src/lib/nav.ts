import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Route = { name: 'ideas' } | { name: 'idea'; slug: string }

export interface OpenBlend {
  version: number
  screen?: string
  tab: BlendTab
}

export type BlendTab = 'screens' | 'palette' | 'fonts' | 'tokens' | 'assets' | 'notes'

interface IdeaUi {
  topic?: string
  blend?: OpenBlend
  expanded?: boolean
}

interface Nav {
  route: Route
  ui: Record<string, IdeaUi>
  openIdea(slug: string): void
  goHome(): void
  patchUi(slug: string, patch: Partial<IdeaUi>): void
}

export const useNav = create<Nav>()(
  persist(
    (set) => ({
      route: { name: 'ideas' },
      ui: {},
      openIdea: (slug) => set({ route: { name: 'idea', slug } }),
      goHome: () => set({ route: { name: 'ideas' } }),
      patchUi: (slug, patch) => set((s) => ({ ui: { ...s.ui, [slug]: { ...s.ui[slug], ...patch } } })),
    }),
    {
      name: 'mocha:nav',
      // A rota volta para a lista: abrir direto numa ideia apagada por fora
      // daria tela de erro na primeira coisa que o usuario ve.
      partialize: (s) => ({ ui: s.ui }),
    },
  ),
)

export const useIdeaUi = (slug: string) => useNav((s) => s.ui[slug] ?? EMPTY)
const EMPTY: IdeaUi = {}
