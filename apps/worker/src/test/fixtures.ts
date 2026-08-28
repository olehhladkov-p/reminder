import type { Db } from '@reminder/db'
import { schema } from '@reminder/db'

export async function seedUser(
  db: Db,
  overrides: Partial<typeof schema.users.$inferInsert> = {},
): Promise<typeof schema.users.$inferSelect> {
  const [row] = await db
    .insert(schema.users)
    .values({ email: `user-${crypto.randomUUID()}@example.com`, timezone: 'UTC', ...overrides })
    .returning()
  if (!row) throw new Error('seedUser: insert returned no row')
  return row
}

export async function seedSubscription(
  db: Db,
  userId: string,
  overrides: Partial<typeof schema.subscriptions.$inferInsert> = {},
): Promise<typeof schema.subscriptions.$inferSelect> {
  const [row] = await db
    .insert(schema.subscriptions)
    .values({
      userId,
      name: 'Test Sub',
      nextRenewalDate: '2027-06-15',
      anchorDay: 15,
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('seedSubscription: insert returned no row')
  return row
}

export async function seedChannel(
  db: Db,
  userId: string,
  overrides: Partial<typeof schema.channelConfigs.$inferInsert> = {},
): Promise<typeof schema.channelConfigs.$inferSelect> {
  const [row] = await db
    .insert(schema.channelConfigs)
    .values({ userId, type: 'email', target: { email: 'user@example.com' }, ...overrides })
    .returning()
  if (!row) throw new Error('seedChannel: insert returned no row')
  return row
}

export async function seedJob(
  db: Db,
  subscriptionId: string,
  channelId: string,
  overrides: Partial<typeof schema.notificationJobs.$inferInsert> = {},
): Promise<typeof schema.notificationJobs.$inferSelect> {
  const [row] = await db
    .insert(schema.notificationJobs)
    .values({
      subscriptionId,
      channelId,
      kind: 'renewal',
      occurrenceDate: '2027-06-15',
      leadDays: 3,
      sendAt: new Date(),
      dedupeKey: crypto.randomUUID(),
      ...overrides,
    })
    .returning()
  if (!row) throw new Error('seedJob: insert returned no row')
  return row
}
