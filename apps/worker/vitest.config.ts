import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Tests never touch the real DB/Resend (an in-memory PGlite db and a fake
    // channel registry are injected instead) - these only exist so env.ts's
    // validation at import time doesn't throw.
    env: {
      DATABASE_URL: 'postgres://unused:unused@localhost:5432/unused',
      RESEND_API_KEY: 'unused',
      RESEND_FROM_EMAIL: 'test@example.com',
      VAPID_PUBLIC_KEY: 'unused',
      VAPID_PRIVATE_KEY: 'unused',
      VAPID_SUBJECT: 'mailto:test@example.com',
    },
  },
})
