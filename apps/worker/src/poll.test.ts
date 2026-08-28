import { schema } from '@reminder/db'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { runPollCycle } from './poll.js'
import { seedChannel, seedJob, seedSubscription, seedUser } from './test/fixtures.js'
import { createFakeChannelRegistry, createTestDb, type TestDb } from './test/testDb.js'

describe('runPollCycle', () => {
  let testDb: TestDb
  let channelRegistry: ReturnType<typeof createFakeChannelRegistry>

  beforeEach(async () => {
    testDb = await createTestDb()
    channelRegistry = createFakeChannelRegistry()
  })

  afterAll(async () => {
    await testDb.close()
  })

  function pollDeps() {
    return {
      db: testDb.db,
      channelRegistry,
      batchSize: 20,
      maxAttempts: 6,
      processingTimeoutMs: 5 * 60_000,
    }
  }

  it('claims a due job and dispatches it end to end', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, {
      sendAt: new Date(Date.now() - 1000),
    })

    const result = await runPollCycle(pollDeps())
    expect(result.claimed).toBe(1)

    const [row] = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.id, job.id))
    expect(row?.status).toBe('sent')
  })

  it('reaps orphaned processing jobs before claiming new ones', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const stuck = await seedJob(testDb.db, sub.id, channel.id, {
      status: 'processing',
      sendAt: new Date(Date.now() - 1000),
    })
    await testDb.db.execute(
      sql`UPDATE notification_jobs SET updated_at = now() - interval '1 hour' WHERE id = ${stuck.id}`,
    )

    // A single poll cycle both recovers the orphaned job and, since its
    // send_at was already due, immediately reclaims and dispatches it.
    const result = await runPollCycle(pollDeps())
    expect(result.reaped).toBe(1)
    expect(result.claimed).toBe(1)

    const [row] = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.id, stuck.id))
    expect(row?.status).toBe('sent')
  })

  it('ignores a job that is not due yet', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    await seedJob(testDb.db, sub.id, channel.id, { sendAt: new Date(Date.now() + 60_000) })

    const result = await runPollCycle(pollDeps())
    expect(result.claimed).toBe(0)
  })
})
