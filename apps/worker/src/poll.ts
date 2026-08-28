import type { NotificationChannel } from '@reminder/channels'
import type { ChannelType } from '@reminder/core'
import type { Db } from '@reminder/db'
import { claimPendingJobs } from './claim.js'
import { dispatchJob } from './dispatch.js'
import { resetStuckProcessingJobs } from './reaper.js'

export interface PollDeps {
  db: Db
  channelRegistry: Map<ChannelType, NotificationChannel>
  batchSize: number
  maxAttempts: number
  processingTimeoutMs: number
}

export interface PollResult {
  reaped: number
  claimed: number
}

/**
 * One iteration of the dispatch loop: recover any jobs orphaned by a crash,
 * claim newly-due jobs, then send them one at a time (sequential, not
 * parallel - simplicity and provider rate limits matter more than
 * throughput at this volume).
 */
export async function runPollCycle(deps: PollDeps): Promise<PollResult> {
  const reaped = await resetStuckProcessingJobs(deps.db, deps.processingTimeoutMs)
  const jobIds = await claimPendingJobs(deps.db, deps.batchSize)
  for (const jobId of jobIds) {
    await dispatchJob(
      { db: deps.db, channelRegistry: deps.channelRegistry, maxAttempts: deps.maxAttempts },
      jobId,
    )
  }
  return { reaped, claimed: jobIds.length }
}
