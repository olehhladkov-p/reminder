// Registers the service worker and notifies the page when a new version is available
// Dispatches a CustomEvent 'sw:update' with { detail: { registration } }

export function registerSW() {
  if (!('serviceWorker' in navigator)) return

  navigator.serviceWorker
    .register('/sw.js')
    .then((registration) => {
      const notifyUpdate = (reg: ServiceWorkerRegistration) => {
        const ev = new CustomEvent('sw:update', { detail: { registration: reg } })
        window.dispatchEvent(ev)
      }

      if (registration.waiting) {
        // There's already a waiting worker — a new version is available
        notifyUpdate(registration)
      }

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          // When a new service worker is installed and there is an active
          // controller, that means a new update is available for the page.
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            notifyUpdate(registration)
          }
        })
      })
    })
    .catch(() => {
      // Registration failures are non-fatal for app runtime; ignore.
    })
}

// Auto-register on module import so simply importing this file enables the
// update detection behavior.
registerSW()
