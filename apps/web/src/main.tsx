import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { Toaster } from './components/ui/sonner.js'
import './index.css'

// biome-ignore lint/style/noNonNullAssertion: index.html always has #root
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster position="top-center" />
  </StrictMode>,
)
