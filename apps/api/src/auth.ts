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
      // The PWA and API are served from separate origins in production
      // (e.g. two distinct *.onrender.com subdomains), so the session
      // cookie needs SameSite=None to be sent on cross-origin fetches.
      // Secure cookies require HTTPS, which only production has - in dev
      // the PWA and API share "localhost" as their cookie site regardless
      // of port, so the default SameSite=Lax already works there.
      ...(env.BETTER_AUTH_URL.startsWith('https://')
        ? { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } }
        : {}),
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
