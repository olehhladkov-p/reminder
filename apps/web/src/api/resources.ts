import { api } from './client.js'
import { ResourceCache } from './resourceCache.js'

export const subscriptionsCache = new ResourceCache(() => api.subscriptions.list())
export const channelsCache = new ResourceCache(() => api.channels.list())
export const remindersCache = new ResourceCache(() => api.reminders.upcoming(50))
export const meCache = new ResourceCache(() => api.me.get())

/** Call on sign-out so the next session never sees a stale previous user's data. */
export function resetAllCaches(): void {
  subscriptionsCache.clear()
  channelsCache.clear()
  remindersCache.clear()
  meCache.clear()
}
