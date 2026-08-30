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
  // inbox for every sign-in. Local-only - reminder-api has no Render preview
  // environment (Render's Preview Environments feature requires a Pro plan
  // for compute services; only the reminder-web static site gets one on the
  // free plan), so this never needs to be set anywhere but a local .env.
  DEV_LOG_MAGIC_LINK: z.coerce.boolean().default(false),
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
