import { api } from '../api/client.js'
import { VAPID_PUBLIC_KEY } from '../config.js'

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window
}

// PushManager wants the VAPID key as a raw Uint8Array, but it's handed out
// (and stored in env) as URL-safe base64 - this is the standard conversion.
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const base64Safe = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64Safe)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes
}

/** Requests notification permission, subscribes via the Push API, and registers the subscription with the server. */
export async function enablePushNotifications(): Promise<void> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was not granted.')
  }

  const registration = await navigator.serviceWorker.ready
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }))

  const json = subscription.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('The browser returned an incomplete push subscription.')
  }
  await api.devices.register({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  })
}
