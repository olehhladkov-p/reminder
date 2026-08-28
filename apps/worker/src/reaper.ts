import type { Db } from '@reminder/db'
import { sql } from 'drizzle-orm'

/**
 * Returns jobs stuck in 'processing' back to 'pending' so they get retried.
 * A job only stays 'processing' this long if the worker that claimed it
 * crashed (or was killed) mid-dispatch, after the claim committed but before
 * it recorded a final status - the `attempts` counter it already consumed is
 * left as-is, so this recovery path is subject to the same MAX_ATTEMPTS
 * exhaustion as an ordinary send failure.
 */
export async function resetStuckProcessingJobs(db: Db, timeoutMs: number): Promise<number> {
  const result = await db.execute(sql`
    UPDATE notification_jobs
    SET status = 'pending', updated_at = now()
    WHERE status = 'processing'
      AND updated_at < now() - (${timeoutMs}::text || ' milliseconds')::interval
    RETURNING id
  `)
  return (result.rows as { id: string }[]).length
}
