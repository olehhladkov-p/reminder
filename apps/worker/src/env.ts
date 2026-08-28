import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  RESEND_FROM_EMAIL: z.string().email(),
  VAPID_PUBLIC_KEY: z.string().min(1),
  VAPID_PRIVATE_KEY: z.string().min(1),
  VAPID_SUBJECT: z.string().min(1),
  // Used to build the "View subscription" link in reminder emails.
  WEB_APP_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  // How often the dispatch loop looks for due jobs.
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(15_000),
  // How many due jobs one poll cycle claims at most.
  BATCH_SIZE: z.coerce.number().int().positive().default(20),
  // Total send attempts (first try + retries) before a job is given up on.
  MAX_ATTEMPTS: z.coerce.number().int().positive().default(6),
  // A job stuck in 'processing' longer than this is assumed to have been
  // orphaned by a crashed worker and is returned to the pending pool.
  PROCESSING_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(5 * 60_000),
  // How often the nightly rollover/pruning task runs.
  NIGHTLY_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60_000),
  // Terminal jobs older than this are deleted by the nightly task.
  JOB_RETENTION_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(90 * 24 * 60 * 60_000),
})

export const env = envSchema.parse(process.env)
