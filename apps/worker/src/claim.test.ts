import { schema } from '@reminder/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { claimPendingJobs } from './claim.js'
import { seedChannel, seedJob, seedSubscription, seedUser } from './test/fixtures.js'
import { createTestDb, type TestDb } from './test/testDb.js'

describe('claimPendingJobs', () => {
  let testDb: TestDb

  beforeEach(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.close()
  })

  async function seedBase() {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    return { user, sub, channel }
  }

  it('claims due pending jobs and flips them to processing, incrementing attempts', async () => {
    const { sub, channel } = await seedBase()
    const due = await seedJob(testDb.db, sub.id, channel.id, {
      sendAt: new Date(Date.now() - 1000),
    })

    const claimed = await claimPendingJobs(testDb.db, 10)
    expect(claimed).toEqual([due.id])

    const [row] = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.id, due.id))
    expect(row?.status).toBe('processing')
    expect(row?.attempts).toBe(1)
  })

  it('does not claim jobs whose send_at is still in the future', async () => {
    const { sub, channel } = await seedBase()
    await seedJob(testDb.db, sub.id, channel.id, { sendAt: new Date(Date.now() + 60_000) })

    expect(await claimPendingJobs(testDb.db, 10)).toEqual([])
  })

  it('does not re-claim a job that is already processing, sent, failed, or cancelled', async () => {
    const { sub, channel } = await seedBase()
    for (const status of ['processing', 'sent', 'failed', 'cancelled'] as const) {
      await seedJob(testDb.db, sub.id, channel.id, {
        sendAt: new Date(Date.now() - 1000),
        status,
        dedupeKey: `dk-${status}`,
      })
    }

    expect(await claimPendingJobs(testDb.db, 10)).toEqual([])
  })

  it('respects the batch size limit', async () => {
    const { sub, channel } = await seedBase()
    for (let i = 0; i < 5; i++) {
      await seedJob(testDb.db, sub.id, channel.id, {
        sendAt: new Date(Date.now() - 1000),
        dedupeKey: `dk-${i}`,
      })
    }

    expect(await claimPendingJobs(testDb.db, 3)).toHaveLength(3)
    // The remaining 2 are still pending and get picked up next cycle.
    expect(await claimPendingJobs(testDb.db, 3)).toHaveLength(2)
  })
})
