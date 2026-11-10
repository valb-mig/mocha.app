import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { CupGlyph } from '@/components/logo'
import { backend } from '@/lib/backend'
import { useNav } from '@/lib/nav'
import { startVaultSync, vault } from '@/lib/vault'
import { IdeaScreen } from '@/screens/idea/idea-screen'
import { IdeasScreen } from '@/screens/ideas'
import { SetupScreen } from '@/screens/setup'

type Status = 'loading' | 'setup' | 'ready'

export function App() {
  const [status, setStatus] = useState<Status>('loading')
  const route = useNav((s) => s.route)

  useEffect(() => {
    void backend.getVault().then((v) => setStatus(v ? 'ready' : 'setup'))
  }, [])

  useEffect(() => {
    if (status !== 'ready') return
    void vault.init()
    return startVaultSync()
  }, [status])

  // O menu de contexto da webview (recarregar, inspecionar) so atrapalha fora do dev.
  useEffect(() => {
    if (import.meta.env.DEV) return
    const block = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('input, textarea, .cm-editor')) e.preventDefault()
    }
    window.addEventListener('contextmenu', block)
    return () => window.removeEventListener('contextmenu', block)
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <CupGlyph className="size-10 animate-breathe text-soft" />
      </div>
    )
  }
  if (status === 'setup') return <SetupScreen onReady={() => setStatus('ready')} />

  const key = route.name === 'idea' ? `idea:${route.slug}` : 'ideas'
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="h-full"
      >
        {route.name === 'idea' ? <IdeaScreen slug={route.slug} /> : <IdeasScreen />}
      </motion.div>
    </AnimatePresence>
  )
}
