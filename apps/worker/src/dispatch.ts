import type { NotificationChannel } from '@reminder/channels'
import type { ChannelType } from '@reminder/core'
import { type Db, schema } from '@reminder/db'
import { eq } from 'drizzle-orm'
import { computeBackoffMs } from './backoff.js'
import { buildReminderPayload } from './payload.js'

export interface DispatchDeps {
  db: Db
  channelRegistry: Map<ChannelType, NotificationChannel>
  maxAttempts: number
}

type NotificationJobRow = typeof schema.notificationJobs.$inferSelect

/**
 * Resolves one already-claimed ('processing') job and takes it to a final
 * or retryable state: 'sent', 'cancelled', 'failed', or back to 'pending'
 * with a delayed send_at for the next attempt.
 */
export async function dispatchJob(deps: DispatchDeps, jobId: string): Promise<void> {
  const { db } = deps
  const [row] = await db
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
    .where(eq(schema.notificationJobs.id, jobId))
  if (!row) return // FK cascade already removed it (subscription/channel deleted mid-flight).

  const { job, subscription, channel } = row

  // Reconciliation deletes pending jobs on pause/cancel/channel-toggle, but
  // there's a race window between that and this job being claimed - recheck.
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
      .where(eq(schema.notificationJobs.id, jobId))
    return
  }

  const adapter = deps.channelRegistry.get(channel.type)
  if (!adapter) {
    await failPermanently(db, job, channel.type, `channel type "${channel.type}" is not supported`)
    return
  }

  const validated = adapter.validateTarget(channel.target)
  if (!validated.ok) {
    await failPermanently(db, job, channel.type, `invalid channel target: ${validated.error}`)
    return
  }

  const payload = buildReminderPayload(job, subscription)

  let result: { ok: boolean; providerMessageId?: string; error?: string }
  try {
    result = await adapter.send(payload, validated.value)
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) }
  }

  if (result.ok) {
    await db
      .update(schema.notificationJobs)
      .set({ status: 'sent', lastError: null })
      .where(eq(schema.notificationJobs.id, jobId))
    await db.insert(schema.deliveries).values({
      jobId,
      channelType: channel.type,
      providerMessageId: result.providerMessageId,
      status: 'sent',
      sentAt: new Date(),
    })
    return
  }

  await recordFailure(deps, job, channel.type, result.error ?? 'unknown error')
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
