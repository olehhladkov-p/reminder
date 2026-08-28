const BASE_MS = 60_000 // 1 minute
const CAP_MS = 6 * 60 * 60_000 // 6 hours

/**
 * Exponential backoff with jitter, keyed by how many attempts have been made
 * so far (>=1). Jitter spreads out retries so a burst of failures (e.g. an
 * email provider outage) doesn't cause every affected job to retry in
 * lockstep on the next poll cycle.
 */
export function computeBackoffMs(attempts: number, random: () => number = Math.random): number {
  const exponential = Math.min(BASE_MS * 2 ** (attempts - 1), CAP_MS)
  const jitter = 0.85 + random() * 0.3 // [0.85, 1.15)
  return Math.round(exponential * jitter)
}
