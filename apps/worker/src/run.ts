import type { NotificationChannel } from '@reminder/channels'
import type { ChannelType } from '@reminder/core'
import type { Db } from '@reminder/db'
import { pruneOldJobs, rollOverDueSubscriptions } from './horizon.js'
import { runPollCycle } from './poll.js'

export interface WorkerConfig {
  db: Db
  channelRegistry: Map<ChannelType, NotificationChannel>
  /** How often the dispatch loop looks for due jobs. */
  pollIntervalMs?: number
  /** How often the nightly rollover/pruning task runs. */
  nightlyIntervalMs?: number
  /** How many due jobs one poll cycle claims at most. */
  batchSize?: number
  /** Total send attempts (first try + retries) before a job is given up on. */
  maxAttempts?: number
  /** A job stuck in 'processing' longer than this is assumed orphaned. */
  processingTimeoutMs?: number
  /** Terminal jobs older than this are deleted by the nightly task. */
  jobRetentionMs?: number
}

export interface WorkerHandle {
  stop: () => void
}

const DEFAULTS = {
  pollIntervalMs: 15_000,
  nightlyIntervalMs: 60 * 60_000,
  batchSize: 20,
  maxAttempts: 6,
  processingTimeoutMs: 5 * 60_000,
  jobRetentionMs: 90 * 24 * 60 * 60_000,
}

/** Runs `fn` on an interval, skipping an overlapping tick if the previous run is still in flight. */
function runOnInterval(name: string, intervalMs: number, fn: () => Promise<void>): NodeJS.Timeout {
  let running = false
  return setInterval(() => {
    if (running) {
      console.warn(`[${name}] previous run still in flight, skipping this tick`)
      return
    }
    running = true
    fn()
      .catch((err) => console.error(`[${name}] failed:`, err))
      .finally(() => {
        running = false
      })
  }, intervalMs)
}

/**
 * Starts the poll and nightly-rollover loops in the current process. Used
 * both by apps/worker's own standalone entrypoint and by apps/api's combined
 * renderStart entrypoint (Render's free tier has no Background Worker type,
 * so the two run together there) - the loop logic itself lives here exactly
 * once either way.
 */
export function startWorker(config: WorkerConfig): WorkerHandle {
  const settings = { ...DEFAULTS, ...config }

  async function poll(): Promise<void> {
    const { reaped, claimed } = await runPollCycle({
      db: config.db,
      channelRegistry: config.channelRegistry,
      batchSize: settings.batchSize,
      maxAttempts: settings.maxAttempts,
      processingTimeoutMs: settings.processingTimeoutMs,
    })
    if (reaped > 0 || claimed > 0) {
      console.log(`[poll] reaped=${reaped} claimed=${claimed}`)
    }
  }

  async function nightly(): Promise<void> {
    const rolled = await rollOverDueSubscriptions(config.db)
    const pruned = await pruneOldJobs(config.db, settings.jobRetentionMs)
    console.log(`[nightly] rolled=${rolled} pruned=${pruned}`)
  }

  console.log(
    `worker starting: poll every ${settings.pollIntervalMs}ms, nightly every ${settings.nightlyIntervalMs}ms`,
  )

  const pollTimer = runOnInterval('poll', settings.pollIntervalMs, poll)
  const nightlyTimer = runOnInterval('nightly', settings.nightlyIntervalMs, nightly)
  // Run once at startup too, rather than waiting a full interval for the first pass.
  poll().catch((err) => console.error('[poll] failed:', err))
  nightly().catch((err) => console.error('[nightly] failed:', err))

  return {
    stop: () => {
      clearInterval(pollTimer)
      clearInterval(nightlyTimer)
    },
  }
}
