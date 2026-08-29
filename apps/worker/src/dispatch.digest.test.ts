import { schema } from '@reminder/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { dispatchJobs } from './dispatch.js'
import { seedChannel, seedJob, seedSubscription, seedUser } from './test/fixtures.js'
import { createFakeChannelRegistry, createTestDb, type TestDb } from './test/testDb.js'

describe('dispatchJobs digest grouping', () => {
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

  it('combines jobs sharing a channel and send_at into a single digest send', async () => {
    const user = await seedUser(testDb.db)
    const channel = await seedChannel(testDb.db, user.id)
    const subA = await seedSubscription(testDb.db, user.id, { name: 'Sub A' })
    const subB = await seedSubscription(testDb.db, user.id, { name: 'Sub B' })
    const sendAt = new Date('2027-06-01T09:00:00Z')
    const jobA = await seedJob(testDb.db, subA.id, channel.id, { status: 'processing', sendAt })
    const jobB = await seedJob(testDb.db, subB.id, channel.id, { status: 'processing', sendAt })

    await dispatchJobs(deps(), [jobA.id, jobB.id])

    const email = channelRegistry.get('email')
    expect(email?.sent).toHaveLength(0)
    expect(email?.sentDigests).toHaveLength(1)
    expect(email?.sentDigests[0]?.payloads.map((p) => p.subscriptionName).sort()).toEqual([
      'Sub A',
      'Sub B',
    ])

    const rows = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.channelId, channel.id))
    expect(rows.every((r) => r.status === 'sent')).toBe(true)

    const deliveries = await testDb.db.select().from(schema.deliveries)
    expect(deliveries).toHaveLength(2)
    expect(deliveries.every((d) => d.providerMessageId === 'fake-digest-message-id')).toBe(true)
  })

  it('does not combine jobs on the same channel with different send_at', async () => {
    const user = await seedUser(testDb.db)
    const channel = await seedChannel(testDb.db, user.id)
    const subA = await seedSubscription(testDb.db, user.id, { name: 'Sub A' })
    const subB = await seedSubscription(testDb.db, user.id, { name: 'Sub B' })
    const jobA = await seedJob(testDb.db, subA.id, channel.id, {
      status: 'processing',
      sendAt: new Date('2027-06-01T09:00:00Z'),
    })
    const jobB = await seedJob(testDb.db, subB.id, channel.id, {
      status: 'processing',
      sendAt: new Date('2027-06-02T09:00:00Z'),
    })

    await dispatchJobs(deps(), [jobA.id, jobB.id])

    const email = channelRegistry.get('email')
    expect(email?.sentDigests).toHaveLength(0)
    expect(email?.sent).toHaveLength(2)
  })

  it('falls back to one send per job when the channel has no digest support', async () => {
    const user = await seedUser(testDb.db)
    const channel = await seedChannel(testDb.db, user.id, {
      type: 'push',
      target: { endpoint: 'https://example.com/push', keys: { p256dh: 'x', auth: 'y' } },
    })
    const subA = await seedSubscription(testDb.db, user.id, { name: 'Sub A' })
    const subB = await seedSubscription(testDb.db, user.id, { name: 'Sub B' })
    const sendAt = new Date('2027-06-01T09:00:00Z')
    const jobA = await seedJob(testDb.db, subA.id, channel.id, { status: 'processing', sendAt })
    const jobB = await seedJob(testDb.db, subB.id, channel.id, { status: 'processing', sendAt })

    await dispatchJobs(deps(), [jobA.id, jobB.id])

    const push = channelRegistry.get('push')
    expect(push?.sendDigest).toBeUndefined()
    expect(push?.sent).toHaveLength(2)

    const rows = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.channelId, channel.id))
    expect(rows.every((r) => r.status === 'sent')).toBe(true)
  })

  it('retries the whole group together when the digest send fails', async () => {
    const user = await seedUser(testDb.db)
    const channel = await seedChannel(testDb.db, user.id)
    const subA = await seedSubscription(testDb.db, user.id, { name: 'Sub A' })
    const subB = await seedSubscription(testDb.db, user.id, { name: 'Sub B' })
    const sendAt = new Date('2027-06-01T09:00:00Z')
    const jobA = await seedJob(testDb.db, subA.id, channel.id, { status: 'processing', sendAt })
    const jobB = await seedJob(testDb.db, subB.id, channel.id, { status: 'processing', sendAt })

    const email = channelRegistry.get('email')
    if (!email) throw new Error('no email channel')
    email.sendDigestImpl = async () => ({ ok: false, error: 'provider unavailable' })

    await dispatchJobs(deps(6), [jobA.id, jobB.id])

    const rows = await testDb.db
      .select()
      .from(schema.notificationJobs)
      .where(eq(schema.notificationJobs.channelId, channel.id))
    expect(rows).toHaveLength(2)
    expect(rows.every((r) => r.status === 'pending')).toBe(true)
    expect(rows.every((r) => r.lastError === 'provider unavailable')).toBe(true)
  })
})
