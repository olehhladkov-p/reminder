import { schema } from '@reminder/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { dispatchJob } from './dispatch.js'
import { seedChannel, seedJob, seedSubscription, seedUser } from './test/fixtures.js'
import { createFakeChannelRegistry, createTestDb, type TestDb } from './test/testDb.js'

describe('dispatchJob', () => {
  let testDb: TestDb
  let channelRegistry: ReturnType<typeof createFakeChannelRegistry>

  beforeEach(async () => {
    testDb = await createTestDb()
    channelRegistry = createFakeChannelRegistry()
  })

  afterAll(async () => {
    await testDb.close()
  })

  function deps(maxAttempts = 6) {
    return { db: testDb.db, channelRegistry, maxAttempts }
  }

  async function loadJob(id: string) {
    const [row] = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.id, id))
    return row
  }

  it('marks a successful send as sent and records a delivery', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing', attempts: 1 })

    await dispatchJob(deps(), job.id)

    const row = await loadJob(job.id)
    expect(row?.status).toBe('sent')
    expect(row?.lastError).toBeNull()

    const [delivery] = await testDb.db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.jobId, job.id))
    expect(delivery?.status).toBe('sent')
    expect(delivery?.providerMessageId).toBe('fake-message-id')

    const email = channelRegistry.get('email')
    expect(email?.sent).toHaveLength(1)
    // Stable across retries so a channel that supports provider-side
    // idempotency never double-sends the same job.
    expect(email?.sent[0]?.payload.idempotencyKey).toBe(job.id)
  })

  it('retries with backoff when attempts remain', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing', attempts: 2 })
    const email = channelRegistry.get('email')
    if (!email) throw new Error('no email channel')
    email.sendImpl = async () => ({ ok: false, error: 'provider unavailable' })

    const before = Date.now()
    await dispatchJob(deps(6), job.id)

    const row = await loadJob(job.id)
    expect(row?.status).toBe('pending')
    expect(row?.lastError).toBe('provider unavailable')
    expect(row?.sendAt.getTime()).toBeGreaterThan(before)
  })

  it('gives up and marks failed once max attempts are exhausted', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing', attempts: 6 })
    const email = channelRegistry.get('email')
    if (!email) throw new Error('no email channel')
    email.sendImpl = async () => ({ ok: false, error: 'still down' })

    await dispatchJob(deps(6), job.id)

    const row = await loadJob(job.id)
    expect(row?.status).toBe('failed')
    expect(row?.lastError).toBe('still down')
    const [delivery] = await testDb.db
      .select()
      .from(schema.deliveries)
      .where(eq(schema.deliveries.jobId, job.id))
    expect(delivery?.status).toBe('failed')
  })

  it('treats a thrown error the same as a failed result', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing', attempts: 1 })
    const email = channelRegistry.get('email')
    if (!email) throw new Error('no email channel')
    email.sendImpl = async () => {
      throw new Error('socket hang up')
    }

    await dispatchJob(deps(6), job.id)

    const row = await loadJob(job.id)
    expect(row?.status).toBe('pending')
    expect(row?.lastError).toBe('socket hang up')
  })

  it('cancels the job instead of sending when the subscription is no longer active', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id, { status: 'paused' })
    const channel = await seedChannel(testDb.db, user.id)
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing', attempts: 1 })

    await dispatchJob(deps(), job.id)

    const row = await loadJob(job.id)
    expect(row?.status).toBe('cancelled')
    expect(channelRegistry.get('email')?.sent).toHaveLength(0)
  })

  it('cancels the job instead of sending when the channel has been disabled', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id, { enabled: false })
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing', attempts: 1 })

    await dispatchJob(deps(), job.id)

    const row = await loadJob(job.id)
    expect(row?.status).toBe('cancelled')
    expect(channelRegistry.get('email')?.sent).toHaveLength(0)
  })

  it('fails permanently on an invalid channel target without waiting for max attempts', async () => {
    const user = await seedUser(testDb.db)
    const sub = await seedSubscription(testDb.db, user.id)
    const channel = await seedChannel(testDb.db, user.id, { target: { email: 'not-an-email' } })
    const job = await seedJob(testDb.db, sub.id, channel.id, { status: 'processing', attempts: 1 })

    await dispatchJob(deps(6), job.id)

    const row = await loadJob(job.id)
    expect(row?.status).toBe('failed')
  })
})
