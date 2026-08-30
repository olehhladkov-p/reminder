import { authSchema, type Db, schema } from '@reminder/db'
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { magicLink } from 'better-auth/plugins'
import { env, webAppOrigins } from './env.js'

// A fresh signup doesn't tell us the user's real IANA timezone yet - the
// client should detect it and PATCH /me right after first login.
const NEW_USER_DEFAULTS = {
  timezone: 'UTC',
  defaultLeadDays: [7, 3, 1],
  digestLocalTime: '09:00:00',
}

export type SendMagicLink = (email: string, url: string) => Promise<void>

/**
 * Factory (not a singleton) so tests can build an auth instance against an
 * isolated in-memory database and a fake sendMagicLink, instead of the real
 * Neon connection and Resend.
 */
export function createAuth(db: Db, sendMagicLink: SendMagicLink) {
  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/v1/auth',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: authSchema,
    }),
    advanced: {
      database: {
        generateId: 'uuid',
      },
      // BETTER_AUTH_URL is set to the web app's own origin (not the API's -
      // see render.yaml), and the web app's static site proxies /v1/* to
      // this API service. So from the browser's point of view every auth
      // request, including the magic-link verify redirect, is same-origin,
      // and the default SameSite=Lax cookie works fine. A prior version of
      // this used SameSite=None to survive being genuinely cross-origin,
      // but Safari's Intelligent Tracking Prevention silently drops
      // SameSite=None cookies on cross-site fetches, which broke magic-link
      // sign-in on iOS - hence routing everything through one origin instead.
    },
    emailAndPassword: {
      enabled: false,
    },
    trustedOrigins: webAppOrigins,
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLink(email, url)
        },
      }),
    ],
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            // Mirrors the auth user's id into our domain `users` row (app
            // preferences: timezone, lead days, digest time). Kept separate
            // from better-auth's own user/session/account/verification
            // tables so the domain schema stays framework-agnostic.
            await db
              .insert(schema.users)
              .values({ id: user.id, email: user.email, ...NEW_USER_DEFAULTS })
              .onConflictDoNothing({ target: schema.users.id })
          },
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>
