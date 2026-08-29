import type { NotificationChannel } from '@reminder/channels'
import type { ChannelType } from '@reminder/core'
import type { Db } from '@reminder/db'
import { claimPendingJobs } from './claim.js'
import { dispatchJobs } from './dispatch.js'
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
 * claim newly-due jobs, then dispatch them group by group (sequential, not
 * parallel - simplicity and provider rate limits matter more than
 * throughput at this volume). Jobs sharing a channel and send_at are sent
 * as a single digest where the channel supports it.
 */
export async function runPollCycle(deps: PollDeps): Promise<PollResult> {
  const reaped = await resetStuckProcessingJobs(deps.db, deps.processingTimeoutMs)
  const jobIds = await claimPendingJobs(deps.db, deps.batchSize)
  await dispatchJobs(
    { db: deps.db, channelRegistry: deps.channelRegistry, maxAttempts: deps.maxAttempts },
    jobIds,
  )
  return { reaped, claimed: jobIds.length }
}
