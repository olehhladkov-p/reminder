import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(1),
  BETTER_AUTH_URL: z.string().url(),
  // Optional: only required if DEV_LOG_MAGIC_LINK is false (the default).
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM_EMAIL: z.string().email().optional(),
  // Dev-only escape hatch: log the magic-link URL to the console instead of
  // sending it through Resend, so local development never needs a real
  // Resend key or a real inbox. Never set this in render.yaml - it must stay
  // opt-in via a local .env, since render.yaml's NODE_ENV=production literal
  // is baked into every environment Render spins up from that blueprint
  // (including any future preview environments), so branching on NODE_ENV
  // here wouldn't actually distinguish preview from production.
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
