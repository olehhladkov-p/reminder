import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  // Always required, even with DEV_LOG_MAGIC_LINK on: channels.ts constructs
  // the reminder-notification email channel (a Resend client, unrelated to
  // magic-link auth) eagerly at import time, and the Resend SDK throws
  // immediately if the key is empty. DEV_LOG_MAGIC_LINK only skips *using*
  // Resend for auth - the value here just needs to be non-empty (a
  // placeholder is fine) for the process to boot.
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  // Dev-only escape hatch: log the magic-link URL to the console instead of
  // sending it through Resend, so local development doesn't need a real
  // inbox for every sign-in. Never set this in render.yaml - it must stay
  // opt-in via a local .env, since render.yaml's NODE_ENV=production literal
  // is baked into every environment Render spins up from that blueprint
  // (including any future preview environments), so branching on NODE_ENV
  // here wouldn't actually distinguish preview from production.
  DEV_LOG_MAGIC_LINK: z.coerce.boolean().default(false),
  // Preview-only escape hatch for reminder-web's static-site /v1/* proxy
  // rewrite (see render.yaml), which can't be pointed at a preview's own
  // dynamic API URL - Render routes destinations are static strings. When
  // true, the web app calls the API's own origin directly (cross-origin)
  // instead of relying on the proxy, so the session cookie switches to
  // SameSite=None (required for cross-site fetch) and the auth base URL
  // uses RENDER_EXTERNAL_URL instead of BETTER_AUTH_URL. Never set this in
  // production - see apps/api/src/auth.ts for why (the whole reason the
  // proxy exists is to avoid Safari ITP dropping SameSite=None cookies).
  CROSS_ORIGIN_AUTH: z.coerce.boolean().default(false),
  // Auto-injected by Render on every service instance (including preview
  // ones) with that instance's own public URL - not set locally. Used as
  // the auth base URL when CROSS_ORIGIN_AUTH is on, since a preview API's
  // URL is only known at runtime, not at render.yaml authoring time.
  RENDER_EXTERNAL_URL: z.string().url().optional(),
  // Web Push (VAPID) - the public key is also served to the client (it's
  // safe to expose; only the private key signs push messages).
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8787),
  // Comma-separated list of origins the PWA is served from (CORS +
  // better-auth trustedOrigins). Defaults to the Vite dev server.
  WEB_APP_ORIGIN: z.string().min(1).default('http://localhost:5173'),
})

export const env = envSchema.parse(process.env)

export const webAppOrigins = env.WEB_APP_ORIGIN.split(',').map((origin) => origin.trim())
