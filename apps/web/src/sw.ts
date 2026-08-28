/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching'
import { registerRoute } from 'workbox-routing'
import { NetworkFirst } from 'workbox-strategies'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)

// The API lives on a separate origin from the app shell in production (see
// apps/api's WEB_APP_ORIGIN/CORS setup) - match by path so this still
// applies cross-origin.
registerRoute(
  ({ url }) => url.pathname.startsWith('/v1/'),
  new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 5 }),
)

interface PushPayload {
  title?: string
  body?: string
  url?: string
}

self.addEventListener('push', (event) => {
  const data: PushPayload = event.data?.json() ?? {}
  event.waitUntil(
    self.registration.showNotification(data.title ?? 'Subscription Reminder', {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url ?? '/' },
    }),
  )
})

// Focuses an already-open tab on that URL if there is one, otherwise opens a
// new one - clicking a notification shouldn't pile up duplicate tabs.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find(
        (client) => new URL(client.url).pathname === new URL(url, self.location.origin).pathname,
      )
      if (existing) return existing.focus()
      return self.clients.openWindow(url)
    }),
  )
})

self.skipWaiting()
