import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import {
  createEmailChannel,
  createWebPushChannel,
  type DeliveryResult,
  type NotificationChannel,
  type ReminderPayload,
} from '@reminder/channels'
import type { ChannelType } from '@reminder/core'
import { authSchema, schema as domainSchema } from '@reminder/db'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'

// The worker never touches the better-auth tables, but @reminder/db's `Db`
// type is defined against the combined schema (see packages/db/src/client.ts)
// so both apps/api and apps/worker share one connection-agnostic type -
// mirror that shape here so this test db satisfies it.
const schema = { ...domainSchema, ...authSchema }

// apps/worker/src/test/testDb.ts -> repo root is 4 levels up.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/db/migrations',
)

export interface FakeChannel extends NotificationChannel {
  sent: { payload: ReminderPayload; target: unknown }[]
  /** Tests overwrite this to script success/failure/throw for the next send(s). */
  sendImpl: (payload: ReminderPayload, target: unknown) => Promise<DeliveryResult>
}

function fakeChannel(type: ChannelType, real: NotificationChannel): FakeChannel {
  const sent: FakeChannel['sent'] = []
  const channel: FakeChannel = {
    type,
    sent,
    validateTarget: (target) => real.validateTarget(target),
    sendImpl: async () => ({ ok: true, providerMessageId: 'fake-message-id' }),
    async send(payload, target) {
      sent.push({ payload, target })
      return channel.sendImpl(payload, target)
    },
  }
  return channel
}

// A well-formed but not-secret VAPID keypair (the standard example from the
// Web Push docs) - only needed to pass web-push's own key-format validation
// at construction time, since `send` is faked out above.
const TEST_VAPID_KEYS = {
  publicKey:
    'BEl62iUYgUivxIkv69yViEuiBIa40HI8DLd7qbFmY3TE4wDaBWlXjECe4Zt5vpFY6d6PA9GA1Kt7DZzuVYFB8Kk',
  privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
}

export function createFakeChannelRegistry(): Map<ChannelType, FakeChannel> {
  const registry = new Map<ChannelType, FakeChannel>()
  registry.set(
    'email',
    fakeChannel('email', createEmailChannel({ apiKey: 'unused', fromEmail: 'test@example.com' })),
  )
  registry.set(
    'push',
    fakeChannel(
      'push',
      createWebPushChannel({ ...TEST_VAPID_KEYS, subject: 'mailto:test@example.com' }),
    ),
  )
  return registry
}

export interface TestDb {
  db: PgliteDatabase<typeof schema>
  reset: () => Promise<void>
  close: () => Promise<void>
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })

  return {
    db,
    reset: async () => {
      await db.delete(schema.deliveries)
      await db.delete(schema.notificationJobs)
      await db.delete(schema.subscriptions)
      await db.delete(schema.channelConfigs)
      await db.delete(schema.users)
    },
    close: async () => {
      await client.close()
    },
  }
}
