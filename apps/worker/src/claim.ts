import type { Db } from '@reminder/db'
import { sql } from 'drizzle-orm'

/**
 * Atomically claims up to `batchSize` due jobs by flipping them from
 * 'pending' to 'processing' in a single statement. `FOR UPDATE SKIP LOCKED`
 * only needs to protect the instant this statement runs — once it commits,
 * the 'processing' status itself is what stops a second worker (or the next
 * poll cycle) from picking the same job up again, so no long-lived
 * transaction has to be held open across the network call that follows.
 */
export async function claimPendingJobs(db: Db, batchSize: number): Promise<string[]> {
  const result = await db.execute(sql`
    UPDATE notification_jobs
    SET status = 'processing', attempts = attempts + 1, updated_at = now()
    WHERE id IN (
      SELECT id FROM notification_jobs
      WHERE status = 'pending' AND send_at <= now()
      ORDER BY send_at ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `)
  const rows = result.rows as { id: string }[]
  return rows.map((r) => r.id)
}
