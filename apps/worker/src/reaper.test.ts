import { schema } from '@reminder/db'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { resetStuckProcessingJobs } from './reaper.js'
import { seedChannel, seedJob, seedSubscription, seedUser } from './test/fixtures.js'
import { createTestDb, type TestDb } from './test/testDb.js'

describe('resetStuckProcessingJobs', () => {
  let testDb: TestDb

  beforeEach(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.close()
  })

  it('returns a stale processing job to pending', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing' })
    await testDb.db.execute(
      sql`UPDATE notification_jobs SET updated_at = now() - interval '10 minutes' WHERE id = ${job.id}`,
    )

    const reaped = await resetStuckProcessingJobs(testDb.db, 5 * 60_000)
    expect(reaped).toBe(1)

    const [row] = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.id, job.id))
    expect(row?.status).toBe('pending')
  })

  it('leaves a recently-claimed processing job alone', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing' })

    expect(await resetStuckProcessingJobs(testDb.db, 5 * 60_000)).toBe(0)

    const [row] = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.id, job.id))
    expect(row?.status).toBe('processing')
  })

  it('does not touch pending, sent, failed, or cancelled jobs', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    for (const status of ['pending', 'sent', 'failed', 'cancelled'] as const) {
      await seedJob(testDb.db, sub.id, channel.id, { status, dedupeKey: `dk-${status}` })
    }

    expect(await resetStuckProcessingJobs(testDb.db, 0)).toBe(0)
  })
})
