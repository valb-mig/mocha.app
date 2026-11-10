import { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { motion } from 'motion/react'
import { CupGlyph } from '@/components/logo'
import { Button } from '@/components/ui/button'
import { backend } from '@/lib/backend'

/** Primeira abertura: escolher onde as ideias moram no disco. */
export function SetupScreen({ onReady }: { onReady: () => void }) {
  const [fallback, setFallback] = useState<string>('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void backend.defaultVault().then(setFallback)
  }, [])

  const use = async (path: string | null) => {
    if (!path) return
    setBusy(true)
    try {
      await backend.setVault(path)
      onReady()
    } finally {
      setBusy(false)
    }
  }

  const short = fallback.replace(/^\/home\/[^/]+|^\/Users\/[^/]+|^C:\\Users\\[^\\]+/, '~')

  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col items-center text-center"
      >
        <CupGlyph className="mb-6 size-16 text-soft" />
        <h1 className="font-serif text-[34px] font-semibold tracking-[-0.02em]">mocha</h1>
        <p className="mt-2 mb-9 text-muted">Onde suas ideias vão morar?</p>
        <div className="flex flex-col items-stretch gap-2">
          <Button variant="primary" size="lg" disabled={busy || !fallback} onClick={() => use(fallback)}>
            Usar <span className="font-mono text-[12.5px] opacity-80">{short || '…'}</span>
          </Button>
          <Button variant="ghost" size="lg" disabled={busy} onClick={async () => use(await backend.pickFolder())}>
            <FolderOpen /> Escolher outra pasta
          </Button>
        </div>
      </motion.div>
    </div>
  )
}
