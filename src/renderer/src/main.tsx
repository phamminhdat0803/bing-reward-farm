import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { TooltipProvider } from '@renderer/components/ui/tooltip'

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      <App />
    </TooltipProvider>
  </StrictMode>
)
