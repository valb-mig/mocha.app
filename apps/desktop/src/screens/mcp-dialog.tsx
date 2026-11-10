import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { backend } from '@/lib/backend'

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [done, setDone] = useState(false)
  return (
    <div>
      <div className="mb-1.5 text-[12px] text-muted">{label}</div>
      <div className="group relative rounded-lg border border-line bg-bg">
        <pre className="overflow-x-auto p-3 pr-11 font-mono text-[12px] leading-relaxed whitespace-pre text-soft select-text">{text}</pre>
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-2 right-2"
          aria-label="Copiar"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setDone(true)
            setTimeout(() => setDone(false), 1200)
          }}
        >
          {done ? <Check className="text-accent" /> : <Copy />}
        </Button>
      </div>
    </div>
  )
}

export function McpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [entry, setEntry] = useState<string | null>(null)
  useEffect(() => {
    if (open) void backend.mcpEntry().then(setEntry).catch(() => setEntry(null))
  }, [open])

  const path = entry ?? '<repo>/packages/mcp/dist/mocha-mcp.js'
  const json = JSON.stringify({ mcpServers: { mocha: { command: 'node', args: [path] } } }, null, 2)

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Conectar agente" className="max-w-xl">
      <div className="space-y-4">
        <CopyBlock label="Claude Code" text={`claude mcp add mocha -s user -- node "${path}"`} />
        <CopyBlock label="Outros clientes" text={json} />
      </div>
    </Dialog>
  )
}
