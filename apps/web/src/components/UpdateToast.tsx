import React, { useEffect, useState } from 'react'

type MaybeSWRegistration = ServiceWorkerRegistration | null

export function UpdateToast() {
  const [visible, setVisible] = useState(false)
  const [registration, setRegistration] = useState<MaybeSWRegistration>(null)

  useEffect(() => {
    function onUpdate(ev: Event) {
      // ev is a CustomEvent dispatched by sw-registration
      const ce = ev as CustomEvent
      setRegistration(ce.detail?.registration ?? null)
      setVisible(true)
    }
    window.addEventListener('sw:update', onUpdate as EventListener)
    return () => window.removeEventListener('sw:update', onUpdate as EventListener)
  }, [])

  useEffect(() => {
    if (!visible) return
    function onControllerChange() {
      // When the new service worker takes control, reload so the app runs the
      // updated code. The reload is triggered only after user press Refresh.
      window.location.reload()
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)
    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
  }, [visible])

  async function handleRefresh() {
    setVisible(false)
    if (registration?.waiting) {
      try {
        // Prefer messaging the waiting SW so it can call skipWaiting() itself.
        registration.waiting.postMessage({ type: 'SKIP_WAITING' })
      } catch (err) {
        // Fallback: attempt to call skipWaiting directly on the worker instance
        try {
          const maybeSkip = (registration.waiting as any)?.skipWaiting
          if (typeof maybeSkip === 'function') {
            await maybeSkip.call(registration.waiting)
          }
        } catch {}
      }
    } else {
      // No SW available to activate (or registration missing) — reload as a
      // best-effort cache-busting fallback.
      window.location.reload()
    }
  }

  if (!visible) return null

  return (
    <div className="fixed inset-x-0 top-4 flex justify-center z-[9999]">
      <div className="rounded-lg bg-popover px-4 py-2 shadow-lg border border-border">
        <div className="flex items-center gap-4">
          <div className="text-sm">A new version of the app is available.</div>
          <button
            onClick={handleRefresh}
            className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-white"
            aria-label="Refresh to update"
          >
            Refresh
          </button>
          <button
            onClick={() => setVisible(false)}
            className="text-sm text-muted-foreground"
            aria-label="Dismiss update notification"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}
