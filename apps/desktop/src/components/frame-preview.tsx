import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { backend } from '@/lib/backend'
import { cn } from '@/lib/cn'
import { Skeleton } from './ui/skeleton'

/** Largura em que as telas sao desenhadas; miniatura e "encaixar" escalam a partir dela. */
export const BASE_WIDTH = 1440
const BASE_HEIGHT = 900

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      if (e) setSize({ w: e.contentRect.width, h: e.contentRect.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, size] as const
}

function useVisible(ref: React.RefObject<HTMLElement | null>) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || visible) return
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setVisible(true), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [ref, visible])
  return visible
}

/**
 * HTML do blend num iframe com origem propria (ver `backend.frameUrl`): o que
 * um agente escrever ali nao alcanca o app nem o Tauri.
 */
export function FramePreview({
  path,
  tick = 0,
  mode,
  title,
  className,
}: {
  path: string
  tick?: number
  mode: 'thumb' | 'fit' | 'actual'
  title?: string
  className?: string
}) {
  const [ref, size] = useSize<HTMLDivElement>()
  const visible = useVisible(ref)
  const [loaded, setLoaded] = useState(false)
  const src = `${backend.frameUrl(path)}?t=${tick}`

  useEffect(() => setLoaded(false), [path])

  const scaled = mode !== 'actual' && size.w > 0 && size.w < BASE_WIDTH
  const scale = scaled ? size.w / BASE_WIDTH : 1
  const frameStyle: React.CSSProperties =
    mode === 'thumb'
      ? { width: BASE_WIDTH, height: BASE_HEIGHT, transform: `scale(${size.w / BASE_WIDTH})` }
      : scaled
        ? { width: BASE_WIDTH, height: size.h / scale, transform: `scale(${scale})` }
        : { width: '100%', height: '100%' }

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden', mode === 'thumb' && 'aspect-[16/10]', className)}
    >
      {(mode === 'thumb' ? visible : true) && size.w > 0 && (
        <iframe
          key={path}
          src={src}
          title={title ?? path}
          sandbox={backend.frameSandbox}
          tabIndex={mode === 'thumb' ? -1 : 0}
          aria-hidden={mode === 'thumb' || undefined}
          onLoad={() => setLoaded(true)}
          className={cn(
            'absolute top-0 left-0 origin-top-left border-0 bg-white transition-opacity duration-300',
            mode === 'thumb' && 'pointer-events-none',
            loaded ? 'opacity-100' : 'opacity-0',
          )}
          style={frameStyle}
        />
      )}
      {!loaded && <Skeleton className="absolute inset-0 rounded-none" />}
    </div>
  )
}
