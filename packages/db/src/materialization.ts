import {
  type MaterializeChannelInput,
  type MaterializeSubscriptionInput,
  type MaterializeUserInput,
  materializeJobs,
  parseIsoDate,
} from '@reminder/core'
import { and, eq } from 'drizzle-orm'
import type { Db } from './client.js'
import { channelConfigs, notificationJobs, subscriptions, users } from './schema.js'

/**
 * Deletes this subscription's pending jobs and regenerates them from current
 * state. Safe to call repeatedly / concurrently: inserts use
 * ON CONFLICT (dedupe_key) DO NOTHING, and materializeJobs() is pure, so two
 * overlapping calls converge on the same result rather than double-booking.
 *
 * Call this after: subscription create/edit, lead_days change (subscription
 * or user default), a channel enabled/disabled/deleted, user timezone or
 * digest time change, or renew. Lives here (not in apps/api or apps/worker)
 * because both the API and the nightly worker task need the exact same
 * delete+regenerate dance.
 */
export async function reconcileSubscriptionJobs(
  db: Db,
  subscriptionId: string,
  now: Date = new Date(),
): Promise<void> {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.id, subscriptionId))
  if (!subscription) return

  const [user] = await db.select().from(users).where(eq(users.id, subscription.userId))
  if (!user) return

  const channels = await db
    .select()
    .from(channelConfigs)
    .where(eq(channelConfigs.userId, subscription.userId))

  await db
    .delete(notificationJobs)
    .where(
      and(
        eq(notificationJobs.subscriptionId, subscriptionId),
        eq(notificationJobs.status, 'pending'),
      ),
    )

  const drafts = materializeJobs(
    toMaterializeSubscription(subscription),
    toMaterializeUser(user),
    channels.map((c): MaterializeChannelInput => ({ id: c.id, enabled: c.enabled })),
    { now },
  )

  if (drafts.length === 0) return

  await db
    .insert(notificationJobs)
    .values(
      drafts.map((d) => ({
        subscriptionId: d.subscriptionId,
        channelId: d.channelId,
        kind: d.kind,
        occurrenceDate: d.occurrenceDate,
        leadDays: d.leadDays,
        sendAt: d.sendAt,
        dedupeKey: d.dedupeKey,
      })),
    )
    .onConflictDoNothing({ target: notificationJobs.dedupeKey })
}

/**
 * Reconciles jobs for every one of a user's subscriptions. Used when the
 * change isn't scoped to one subscription: a channel enabled/disabled/
 * deleted, or the user's timezone/digest time/default lead days changed.
 */
export async function reconcileUserJobs(
  db: Db,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  const rows = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
  for (const row of rows) {
    await reconcileSubscriptionJobs(db, row.id, now)
  }
}

function toMaterializeSubscription(
  row: typeof subscriptions.$inferSelect,
): MaterializeSubscriptionInput {
  return {
    id: row.id,
    status: row.status,
    nextRenewalDate: parseIsoDate(row.nextRenewalDate),
    cycle: row.cycle,
    intervalDays: row.intervalDays,
    anchorDay: row.anchorDay,
    leadDays: row.leadDays,
    isTrial: row.isTrial,
  }
}

function toMaterializeUser(row: typeof users.$inferSelect): MaterializeUserInput {
  return {
    timezone: row.timezone,
    // stored as 'HH:MM:SS' by Postgres `time`; core expects 'HH:mm'
    digestLocalTime: row.digestLocalTime.slice(0, 5),
    defaultLeadDays: row.defaultLeadDays,
  }
}
