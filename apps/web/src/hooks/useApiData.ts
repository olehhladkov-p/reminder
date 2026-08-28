import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../api/client.js'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/**
 * Fetches on mount (and whenever `deps` changes) and exposes `reload` for
 * re-fetching after a mutation. `fetcher` is only read at call time, not
 * tracked as a dependency - pass whatever it needs to close over via `deps`.
 */
export function useApiData<T>(fetcher: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })

  const reload = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await fetcher()
      setState({ data, loading: false, error: null })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Something went wrong.'
      setState({ data: null, loading: false, error: message })
    }
    // biome-ignore lint/correctness/useExhaustiveDependencies: fetcher is intentionally excluded - callers list its real inputs in `deps`
  }, deps)

  useEffect(() => {
    reload()
  }, [reload])

  return { ...state, reload }
}
