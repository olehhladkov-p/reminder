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
import { desc } from 'drizzle-orm'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { createApp } from '../app.js'
import { createAuth } from '../auth.js'

const schema = { ...domainSchema, ...authSchema }

// apps/api/src/test/testApp.ts -> repo root is 4 levels up.
const migrationsFolder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/db/migrations',
)

export interface FakeChannel extends NotificationChannel {
  sent: { payload: ReminderPayload; target: unknown }[]
}

/**
 * Wraps a real adapter so `validateTarget` (pure, no I/O) behaves exactly
 * like production - including e.g. the web-push subscription shape check -
 * while `send` is faked out so tests never hit Resend/the push service over
 * the network.
 */
function fakeSendOnly(real: NotificationChannel): FakeChannel {
  const sent: FakeChannel['sent'] = []
  return {
    type: real.type,
    sent,
    validateTarget: (target) => real.validateTarget(target),
    async send(payload: ReminderPayload, target: unknown): Promise<DeliveryResult> {
      sent.push({ payload, target })
      return { ok: true, providerMessageId: 'fake-message-id' }
    },
  }
}

// A well-formed but not-secret VAPID keypair (the standard example from the
// Web Push docs) - only needed to pass web-push's own key-format validation
// at construction time, since `send` is faked out below.
const TEST_VAPID_KEYS = {
  publicKey:
    'BEl62iUYgUivxIkv69yViEuiBIa40HI8DLd7qbFmY3TE4wDaBWlXjECe4Zt5vpFY6d6PA9GA1Kt7DZzuVYFB8Kk',
  privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
}

/** Never calls Resend/the push service - records what would have been sent instead. */
export function createFakeChannelRegistry(): Map<ChannelType, FakeChannel> {
  const registry = new Map<ChannelType, FakeChannel>()
  registry.set(
    'email',
    fakeSendOnly(createEmailChannel({ apiKey: 'unused', fromEmail: 'test@example.com' })),
  )
  registry.set(
    'push',
    fakeSendOnly(createWebPushChannel({ ...TEST_VAPID_KEYS, subject: 'mailto:test@example.com' })),
  )
  return registry
}

export interface TestApp {
  app: ReturnType<typeof createApp>
  db: PgliteDatabase<typeof schema>
  channelRegistry: Map<ChannelType, FakeChannel>
  sentMagicLinks: { email: string; url: string }[]
  /** Deletes all rows so the next test starts from an empty database. */
  reset: () => Promise<void>
  close: () => Promise<void>
}

export async function createTestApp(): Promise<TestApp> {
  const client = new PGlite()
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder })

  const sentMagicLinks: TestApp['sentMagicLinks'] = []
  const auth = createAuth(db, async (email, url) => {
    sentMagicLinks.push({ email, url })
  })
  const channelRegistry = createFakeChannelRegistry()
  const app = createApp({ db, auth, channelRegistry })

  return {
    app,
    db,
    channelRegistry,
    sentMagicLinks,
    reset: async () => {
      await db.delete(domainSchema.deliveries)
      await db.delete(domainSchema.notificationJobs)
      await db.delete(domainSchema.subscriptions)
      await db.delete(domainSchema.channelConfigs)
      await db.delete(domainSchema.users)
      await db.delete(authSchema.session)
      await db.delete(authSchema.account)
      await db.delete(authSchema.verification)
      await db.delete(authSchema.user)
      sentMagicLinks.length = 0
      for (const channel of channelRegistry.values()) channel.sent.length = 0
    },
    close: async () => {
      await client.close()
    },
  }
}

/**
 * Runs the full magic-link sign-in flow through the real HTTP routes (not
 * shortcuts) and returns the session cookie header, exactly like a real
 * client would end up with one - just without needing a real inbox.
 */
export async function signIn(testApp: TestApp, email: string): Promise<string> {
  const signInRes = await testApp.app.request('/v1/auth/sign-in/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!signInRes.ok) {
    throw new Error(`sign-in failed: ${signInRes.status} ${await signInRes.text()}`)
  }

  const [row] = await testApp.db
    .select({ identifier: authSchema.verification.identifier })
    .from(authSchema.verification)
    .orderBy(desc(authSchema.verification.createdAt))
    .limit(1)
  if (!row) throw new Error('no verification token was created')

  const verifyRes = await testApp.app.request(
    `/v1/auth/magic-link/verify?token=${encodeURIComponent(row.identifier)}`,
  )
  if (!verifyRes.ok) {
    throw new Error(`verify failed: ${verifyRes.status} ${await verifyRes.text()}`)
  }
  const cookie = verifyRes.headers.get('set-cookie')
  if (!cookie) throw new Error('magic-link verify did not set a session cookie')
  return cookie
}
