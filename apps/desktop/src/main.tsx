import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/fraunces'
import './styles.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { queryClient } from '@/lib/vault'
import { App } from './app'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </MotionConfig>
      <Toaster
        theme="dark"
        position="bottom-center"
        duration={1800}
        toastOptions={{
          className: '!bg-raised !border-line-strong !text-fg !rounded-lg !font-sans',
          descriptionClassName: '!text-muted !font-mono !text-[11.5px]',
        }}
      />
    </QueryClientProvider>
  </StrictMode>,
)
