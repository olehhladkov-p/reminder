/**
 * Dev-only database maintenance: removes leftover test accounts (email
 * starting with "test-", e.g. from manually exercising the magic-link flow)
 * and (re)seeds a fixed dev@test.com user with fake subscriptions so local
 * development always has the same account and data to work against.
 *
 * Run with: pnpm --filter @reminder/api run seed:dev
 */
import { authSchema, createDb, reconcileUserJobs, schema } from '@reminder/db'
import { eq, ilike, or } from 'drizzle-orm'
import { env } from '../env.js'

const DEV_EMAIL = 'dev@test.com'

async function main() {
  const { db, pool } = createDb(env.DATABASE_URL)

  const testAuthUsers = await db
    .select({ id: authSchema.user.id, email: authSchema.user.email })
    .from(authSchema.user)
    .where(ilike(authSchema.user.email, 'test-%'))
  const testDomainUsers = await db
    .select({ id: schema.users.id, email: schema.users.email })
    .from(schema.users)
    .where(ilike(schema.users.email, 'test-%'))

  const testEmails = [...new Set([...testAuthUsers, ...testDomainUsers].map((u) => u.email))]
  console.log(`Found ${testEmails.length} test-* account(s):`, testEmails)

  if (testAuthUsers.length > 0) {
    // Cascades to session/account (onDelete: 'cascade' - see authSchema.ts).
    await db.delete(authSchema.user).where(ilike(authSchema.user.email, 'test-%'))
  }
  if (testDomainUsers.length > 0) {
    // Cascades to subscriptions/channelConfigs -> notificationJobs -> deliveries.
    await db.delete(schema.users).where(ilike(schema.users.email, 'test-%'))
  }
  if (testEmails.length > 0) {
    // Magic-link verification rows aren't linked by userId FK - clean up by
    // value (email) or identifier, whichever the plugin used.
    await db
      .delete(authSchema.verification)
      .where(
        or(
          ilike(authSchema.verification.value, 'test-%'),
          ilike(authSchema.verification.identifier, 'test-%'),
        ),
      )
  }
  console.log(`Removed ${testEmails.length} test-* account(s) and their data.`)

  const [existingAuthUser] = await db
    .select()
    .from(authSchema.user)
    .where(eq(authSchema.user.email, DEV_EMAIL))

  let authUserId = existingAuthUser?.id
  if (!authUserId) {
    const [inserted] = await db
      .insert(authSchema.user)
      .values({ name: 'Dev', email: DEV_EMAIL, emailVerified: true })
      .returning({ id: authSchema.user.id })
    if (!inserted) throw new Error('failed to insert dev auth user')
    authUserId = inserted.id
  }

  await db
    .insert(schema.users)
    .values({
      id: authUserId,
      email: DEV_EMAIL,
      timezone: 'America/New_York',
      defaultLeadDays: [7, 3, 1],
      digestLocalTime: '09:00:00',
    })
    .onConflictDoUpdate({
      target: schema.users.id,
      set: { email: DEV_EMAIL },
    })

  // Wipe this user's subscriptions/channels so re-running the script always
  // converges on the same fake data instead of accumulating duplicates.
  await db.delete(schema.subscriptions).where(eq(schema.subscriptions.userId, authUserId))
  await db.delete(schema.channelConfigs).where(eq(schema.channelConfigs.userId, authUserId))

  await db.insert(schema.channelConfigs).values({
    userId: authUserId,
    type: 'email',
    target: { email: DEV_EMAIL },
    enabled: true,
    verifiedAt: new Date(),
  })

  const daysFromNow = (n: number) => {
    const d = new Date()
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  const netflixRenewal = daysFromNow(5)
  const spotifyRenewal = daysFromNow(20)
  const notionTrialEnd = daysFromNow(3)
  const gymRenewal = daysFromNow(-10)

  const fakeSubscriptions = [
    {
      name: 'Netflix',
      nextRenewalDate: netflixRenewal,
      cycle: 'monthly' as const,
      anchorDay: new Date(netflixRenewal).getUTCDate(),
      priceCents: 1599,
      currency: 'USD',
      leadDays: [3, 1],
      status: 'active' as const,
    },
    {
      name: 'Spotify Premium',
      nextRenewalDate: spotifyRenewal,
      cycle: 'yearly' as const,
      anchorDay: new Date(spotifyRenewal).getUTCDate(),
      priceCents: 11988,
      currency: 'USD',
      leadDays: [7, 1],
      status: 'active' as const,
    },
    {
      name: 'Notion (trial)',
      nextRenewalDate: daysFromNow(33),
      cycle: 'monthly' as const,
      anchorDay: new Date(notionTrialEnd).getUTCDate(),
      trialEndsAt: notionTrialEnd,
      trialLeadDays: [3, 1],
      status: 'active' as const,
    },
    {
      name: 'Old Gym Membership',
      nextRenewalDate: gymRenewal,
      cycle: 'monthly' as const,
      anchorDay: new Date(gymRenewal).getUTCDate(),
      priceCents: 4500,
      currency: 'USD',
      status: 'cancelled' as const,
    },
  ]

  const insertedSubs = await db
    .insert(schema.subscriptions)
    .values(fakeSubscriptions.map((s) => ({ ...s, userId: authUserId })))
    .returning({ id: schema.subscriptions.id })

  await reconcileUserJobs(db, authUserId)

  console.log(
    `Seeded ${DEV_EMAIL} (user id ${authUserId}) with ${insertedSubs.length} fake subscriptions.`,
  )

  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
