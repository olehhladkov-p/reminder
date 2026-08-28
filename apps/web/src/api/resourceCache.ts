import { useSyncExternalStore } from 'react'
import { ApiError } from './client.js'

export interface ResourceSnapshot<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * A per-resource cache with a single in-flight fetch, shared across every
 * component that reads it via useResource(). The point: switching between
 * nav tabs (Subscriptions/Reminders/Channels/Settings) re-renders from the
 * last-known data instead of re-fetching and flashing a loading state -
 * callers that mutate data explicitly call `refresh()` to get fresh data.
 */
export class ResourceCache<T> {
  private snapshot: ResourceSnapshot<T> = { data: null, loading: false, error: null }
  private listeners = new Set<() => void>()
  private inFlight: Promise<void> | null = null

  constructor(private fetcher: () => Promise<T>) {}

  getSnapshot = (): ResourceSnapshot<T> => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    if (this.snapshot.data === null && !this.inFlight) this.load()
    return () => this.listeners.delete(listener)
  }

  /** Re-fetches even if data is already cached - call after a mutation. */
  refresh = (): Promise<void> => this.load()

  /** Drops cached data without fetching - call on sign-out, not sign-in. */
  clear = (): void => {
    this.inFlight = null
    this.set({ data: null, loading: false, error: null })
  }

  private set(next: Partial<ResourceSnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...next }
    for (const listener of this.listeners) listener()
  }

  private load(): Promise<void> {
    if (this.inFlight) return this.inFlight
    this.set({ loading: true, error: null })
    this.inFlight = this.fetcher()
      .then((data) => this.set({ data, loading: false }))
      .catch((err) => {
        const message = err instanceof ApiError ? err.message : 'Something went wrong.'
        this.set({ loading: false, error: message })
      })
      .finally(() => {
        this.inFlight = null
      })
    return this.inFlight
  }
}

export function useResource<T>(cache: ResourceCache<T>): ResourceSnapshot<T> {
  return useSyncExternalStore(cache.subscribe, cache.getSnapshot, cache.getSnapshot)
}
