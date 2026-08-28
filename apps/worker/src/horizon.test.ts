import { schema } from '@reminder/db'
import { eq, sql } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { pruneOldJobs, rollOverDueSubscriptions } from './horizon.js'
import { seedChannel, seedJob, seedSubscription, seedUser } from './test/fixtures.js'
import { createTestDb, type TestDb } from './test/testDb.js'

describe('rollOverDueSubscriptions', () => {
  let testDb: TestDb

  beforeEach(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.close()
  })

  it('advances a subscription whose renewal date has passed to a future occurrence', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id, {
      nextRenewalDate: '2020-01-15',
      anchorDay: 15,
      cycle: 'monthly',
    })
    const now = new Date('2027-06-20T00:00:00Z')

    const rolled = await rollOverDueSubscriptions(testDb.db, now)
    expect(rolled).toBe(1)

    const [row] = await testDb.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, sub.id))
    // 2027-06-15 (the 15th-of-the-month occurrence at or before "now") is
    // still before now (2027-06-20), so rollover has to advance one more
    // month to land on the first occurrence that is not in the past.
    expect(row?.nextRenewalDate).toBe('2027-07-15')
  })

  it('leaves a subscription whose renewal date is still in the future untouched', async () => {
    const user = await seedUser(testDb.db)
    await seedSubscription(testDb.db, user.id, { nextRenewalDate: '2027-12-01', anchorDay: 1 })
    const now = new Date('2027-06-20T00:00:00Z')

    expect(await rollOverDueSubscriptions(testDb.db, now)).toBe(0)
  })

  it('re-materializes jobs against the rolled-forward date', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id, {
      nextRenewalDate: '2020-01-15',
      anchorDay: 15,
      cycle: 'monthly',
      leadDays: [3],
    })
    await seedChannel(testDb.db, user.id)
    const now = new Date('2027-06-20T00:00:00Z')

    await rollOverDueSubscriptions(testDb.db, now)

    const jobs = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.subscriptionId, sub.id))
    expect(jobs.length).toBeGreaterThan(0)
    for (const job of jobs) {
      expect(job.occurrenceDate >= '2027-07-15').toBe(true)
    }
  })

  it('never touches a paused or cancelled subscription', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id, {
      nextRenewalDate: '2020-01-15',
      anchorDay: 15,
      status: 'paused',
    })
    const now = new Date('2027-06-20T00:00:00Z')

    expect(await rollOverDueSubscriptions(testDb.db, now)).toBe(0)
    const [row] = await testDb.db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, sub.id))
    expect(row?.nextRenewalDate).toBe('2020-01-15')
  })
})

describe('pruneOldJobs', () => {
  let testDb: TestDb

  beforeEach(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.close()
  })

  it('deletes old terminal jobs but keeps recent ones and pending ones', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)

    const old = await seedJob(testDb.db, sub.id, channel.id, { status: 'sent', dedupeKey: 'old' })
    await testDb.db.execute(
      sql`UPDATE notification_jobs SET updated_at = now() - interval '200 days' WHERE id = ${old.id}`,
    )
    const recent = await seedJob(testDb.db, sub.id, channel.id, {
      status: 'sent',
      dedupeKey: 'recent',
    })
    const pending = await seedJob(testDb.db, sub.id, channel.id, {
      status: 'pending',
      dedupeKey: 'pending',
    })
    await testDb.db.execute(
      sql`UPDATE notification_jobs SET updated_at = now() - interval '200 days' WHERE id = ${pending.id}`,
    )

    const pruned = await pruneOldJobs(testDb.db, 90 * 24 * 60 * 60_000)
    expect(pruned).toBe(1)

    const remainingIds = (
      await testDb.db.select({ id: schema.notificationJobs.id }).from(schema.notificationJobs)
    ).map((r) => r.id)
    expect(remainingIds.sort()).toEqual([pending.id, recent.id].sort())
  })
})
