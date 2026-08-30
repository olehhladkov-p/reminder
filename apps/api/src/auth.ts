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
    // Normally the web app's own origin (not the API's - see render.yaml),
    // proxied same-origin through the static site's /v1/* rewrite. Render
    // Preview Environments can't give that rewrite rule a dynamic per-PR
    // destination, so previews set CROSS_ORIGIN_AUTH instead and skip the
    // proxy entirely - RENDER_EXTERNAL_URL is this instance's own actual
    // preview URL, known only at runtime.
    baseURL:
      env.CROSS_ORIGIN_AUTH && env.RENDER_EXTERNAL_URL
        ? env.RENDER_EXTERNAL_URL
        : env.BETTER_AUTH_URL,
    basePath: '/v1/auth',
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: authSchema,
    }),
    advanced: {
      database: {
        generateId: 'uuid',
      },
      // Same-origin (the default): the default SameSite=Lax cookie works
      // fine, and it's deliberately NOT SameSite=None because Safari's
      // Intelligent Tracking Prevention silently drops SameSite=None cookies
      // on cross-site fetches, which broke magic-link sign-in on iOS -
      // that's why production routes everything through one origin instead
      // of calling the API's own domain directly. CROSS_ORIGIN_AUTH opts a
      // preview environment back into genuine cross-origin cookies, on the
      // assumption previews are for functional testing, not iOS Safari
      // compatibility testing.
      ...(env.CROSS_ORIGIN_AUTH
        ? {
            useSecureCookies: true,
            defaultCookieAttributes: { sameSite: 'none' as const, secure: true },
          }
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
