import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.js'
import { Toaster } from './components/ui/sonner.js'
import './index.css'

// Register the service worker and mount the update toast so the app can
// notify users (including installed PWAs) when a new version is available.
import './sw-registration.js'
import { UpdateToast } from './components/UpdateToast.js'
import { applyColorMode, applyTheme, getStoredColorMode, getStoredTheme } from './lib/theme.js'

applyTheme(getStoredTheme())
applyColorMode(getStoredColorMode())

// biome-ignore lint/style/noNonNullAssertion: index.html always has #root
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <UpdateToast />
    <Toaster position="top-center" />
  </StrictMode>,
)
