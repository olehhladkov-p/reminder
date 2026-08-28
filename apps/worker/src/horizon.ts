import {
  advance,
  comparePlainDates,
  formatIsoDate,
  type PlainDate,
  parseIsoDate,
} from '@reminder/core'
import { type Db, reconcileSubscriptionJobs, schema } from '@reminder/db'
import { and, eq, lt, sql } from 'drizzle-orm'

function utcToday(now: Date): PlainDate {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1, day: now.getUTCDate() }
}

// Guards against an unbounded loop if a subscription's cycle math somehow
// never reaches "not in the past" (it always should - this is a backstop).
const MAX_ROLLOVER_STEPS = 1000

/**
 * Advances any active subscription whose `next_renewal_date` has already
 * passed to its next future occurrence - looping if the worker was down for
 * more than one cycle - then re-materializes its jobs.
 *
 * `materializeJobs()` only ever looks 2 occurrences ahead of
 * `next_renewal_date`, so without this rollover the reminder horizon would
 * stop advancing forever once those 2 jobs had fired.
 */
export async function rollOverDueSubscriptions(db: Db, now: Date = new Date()): Promise<number> {
  const today = utcToday(now)
  const due = await db
    .select()
    .from(schema.subscriptions)
    .where(
      and(
        eq(schema.subscriptions.status, 'active'),
        lt(schema.subscriptions.nextRenewalDate, formatIsoDate(today)),
      ),
    )

  let rolled = 0
  for (const sub of due) {
    let next = parseIsoDate(sub.nextRenewalDate)
    for (let steps = 0; comparePlainDates(next, today) < 0 && steps < MAX_ROLLOVER_STEPS; steps++) {
      next = advance(next, sub.cycle, { anchorDay: sub.anchorDay, intervalDays: sub.intervalDays })
    }
    const nextIso = formatIsoDate(next)
    if (nextIso === sub.nextRenewalDate) continue

    await db
      .update(schema.subscriptions)
      .set({ nextRenewalDate: nextIso })
      .where(eq(schema.subscriptions.id, sub.id))
    await reconcileSubscriptionJobs(db, sub.id, now)
    rolled++
  }
  return rolled
}

/** Deletes terminal (sent/failed/cancelled) jobs past their retention window. */
export async function pruneOldJobs(db: Db, retentionMs: number): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM notification_jobs
    WHERE status IN ('sent', 'failed', 'cancelled')
      AND updated_at < now() - (${retentionMs}::text || ' milliseconds')::interval
    RETURNING id
  `)
  return (result.rows as { id: string }[]).length
}
