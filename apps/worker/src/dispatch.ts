import { createHash } from 'node:crypto'
import type { DeliveryResult, NotificationChannel, ReminderPayload } from '@reminder/channels'
import type { ChannelType } from '@reminder/core'
import { type Db, schema } from '@reminder/db'
import { eq, inArray } from 'drizzle-orm'
import { computeBackoffMs } from './backoff.js'
import { buildReminderPayload } from './payload.js'

export interface DispatchDeps {
  db: Db
  channelRegistry: Map<ChannelType, NotificationChannel>
  maxAttempts: number
}

type NotificationJobRow = typeof schema.notificationJobs.$inferSelect
type SubscriptionRow = typeof schema.subscriptions.$inferSelect
type ChannelConfigRow = typeof schema.channelConfigs.$inferSelect

interface ClaimedRow {
  job: NotificationJobRow
  subscription: SubscriptionRow
  channel: ChannelConfigRow
}

/**
 * Resolves one already-claimed ('processing') job and takes it to a final
 * or retryable state: 'sent', 'cancelled', 'failed', or back to 'pending'
 * with a delayed send_at for the next attempt.
 */
export async function dispatchJob(deps: DispatchDeps, jobId: string): Promise<void> {
  const [row] = await loadClaimedRows(deps.db, [jobId])
  if (!row) return // FK cascade already removed it (subscription/channel deleted mid-flight).
  await dispatchGroup(deps, [row])
}

/**
 * Resolves a batch of already-claimed jobs (one poll cycle's worth). Jobs
 * that share a channel and an exact send_at - which happens whenever a
 * user's digest time lines up several subscriptions onto the same instant -
 * are combined into a single provider call when the channel supports
 * sendDigest, so the user gets one notification listing all of them instead
 * of one per subscription.
 */
export async function dispatchJobs(deps: DispatchDeps, jobIds: string[]): Promise<void> {
  if (jobIds.length === 0) return
  const rows = await loadClaimedRows(deps.db, jobIds)
  for (const group of groupByChannelAndSendAt(rows)) {
    await dispatchGroup(deps, group)
  }
}

function loadClaimedRows(db: Db, jobIds: string[]): Promise<ClaimedRow[]> {
  return db
    .select({
      job: schema.notificationJobs,
      subscription: schema.subscriptions,
      channel: schema.channelConfigs,
    })
    .from(schema.notificationJobs)
    .innerJoin(
      schema.subscriptions,
      eq(schema.notificationJobs.subscriptionId, schema.subscriptions.id),
    )
    .innerJoin(
      schema.channelConfigs,
      eq(schema.notificationJobs.channelId, schema.channelConfigs.id),
    )
    .where(inArray(schema.notificationJobs.id, jobIds))
}

function groupByChannelAndSendAt(rows: ClaimedRow[]): ClaimedRow[][] {
  const groups = new Map<string, ClaimedRow[]>()
  for (const row of rows) {
    const key = `${row.channel.id}::${row.job.sendAt.toISOString()}`
    const group = groups.get(key)
    if (group) group.push(row)
    else groups.set(key, [row])
  }
  return [...groups.values()]
}

async function dispatchGroup(deps: DispatchDeps, group: ClaimedRow[]): Promise<void> {
  const { db } = deps

  // Reconciliation deletes pending jobs on pause/cancel/channel-toggle, but
  // there's a race window between that and a job being claimed - recheck.
  const live: ClaimedRow[] = []
  for (const row of group) {
    const { job, subscription, channel } = row
    if (subscription.status !== 'active' || !channel.enabled) {
      await db
        .update(schema.notificationJobs)
        .set({
          status: 'cancelled',
          lastError:
            subscription.status !== 'active'
              ? `subscription is ${subscription.status}`
              : 'channel is disabled',
        })
        .where(eq(schema.notificationJobs.id, job.id))
      continue
    }
    live.push(row)
  }
  if (live.length === 0) return

  // Every row in `group` shares one channel by construction (see
  // groupByChannelAndSendAt), so any row's channel config speaks for all.
  // `live.length === 0` already returned above, so index 0 exists.
  const channel = live[0]?.channel
  if (!channel) return
  const adapter = deps.channelRegistry.get(channel.type)
  if (!adapter) {
    for (const row of live) {
      await failPermanently(
        db,
        row.job,
        channel.type,
        `channel type "${channel.type}" is not supported`,
      )
    }
    return
  }

  const validated = adapter.validateTarget(channel.target)
  if (!validated.ok) {
    for (const row of live) {
      await failPermanently(db, row.job, channel.type, `invalid channel target: ${validated.error}`)
    }
    return
  }

  if (live.length > 1 && adapter.sendDigest) {
    await sendDigestGroup(deps, adapter.sendDigest, validated.value, live)
    return
  }

  for (const row of live) {
    await sendSingle(deps, adapter.send, validated.value, row)
  }
}

async function sendSingle(
  deps: DispatchDeps,
  send: NotificationChannel['send'],
  target: unknown,
  row: ClaimedRow,
): Promise<void> {
  const { job, subscription, channel } = row
  const payload = buildReminderPayload(job, subscription)

  let result: DeliveryResult
  try {
    result = await send(payload, target)
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (result.ok) {
    await markSent(deps.db, job.id, channel.type, result.providerMessageId)
    return
  }
  await recordFailure(deps, job, channel.type, result.error ?? 'unknown error')
}

async function sendDigestGroup(
  deps: DispatchDeps,
  sendDigest: NonNullable<NotificationChannel['sendDigest']>,
  target: unknown,
  group: ClaimedRow[],
): Promise<void> {
  // Stable across retries of the same job set, so a channel with
  // provider-side idempotency (email/Resend) never double-sends the digest
  // even if the worker crashes between a successful send and recording it.
  const digestKey = computeDigestKey(group.map((row) => row.job.id))
  const payloads: ReminderPayload[] = group.map((row) => ({
    ...buildReminderPayload(row.job, row.subscription),
    idempotencyKey: digestKey,
  }))

  let result: DeliveryResult
  try {
    result = await sendDigest(payloads, target)
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (result.ok) {
    for (const row of group) {
      await markSent(deps.db, row.job.id, row.channel.type, result.providerMessageId)
    }
    return
  }
  for (const row of group) {
    await recordFailure(deps, row.job, row.channel.type, result.error ?? 'unknown error')
  }
}

function computeDigestKey(jobIds: string[]): string {
  const hash = createHash('sha1')
    .update([...jobIds].sort().join(','))
    .digest('hex')
  return `digest:${hash}`
}

async function markSent(
  db: Db,
  jobId: string,
  channelType: ChannelType,
  providerMessageId: string | undefined,
): Promise<void> {
  await db
    .update(schema.notificationJobs)
    .set({ status: 'sent', lastError: null })
    .where(eq(schema.notificationJobs.id, jobId))
  await db.insert(schema.deliveries).values({
    jobId,
    channelType,
    providerMessageId,
    status: 'sent',
    sentAt: new Date(),
  })
}

async function recordFailure(
  deps: DispatchDeps,
  job: NotificationJobRow,
  channelType: ChannelType,
  error: string,
): Promise<void> {
  const { db } = deps
  if (job.attempts >= deps.maxAttempts) {
    await failPermanently(db, job, channelType, error)
    return
  }

  const delayMs = computeBackoffMs(job.attempts)
  await db
    .update(schema.notificationJobs)
    .set({ status: 'pending', lastError: error, sendAt: new Date(Date.now() + delayMs) })
    .where(eq(schema.notificationJobs.id, job.id))
}

async function failPermanently(
  db: Db,
  job: NotificationJobRow,
  channelType: ChannelType,
  error: string,
): Promise<void> {
  await db
    .update(schema.notificationJobs)
    .set({ status: 'failed', lastError: error })
    .where(eq(schema.notificationJobs.id, job.id))
  await db.insert(schema.deliveries).values({
    jobId: job.id,
    channelType,
    status: 'failed',
    error,
  })
}
