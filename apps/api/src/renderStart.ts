import { serve } from '@hono/node-server'
import { startWorker } from '@reminder/worker'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { channelRegistry } from './channels.js'
import { db } from './db.js'
import { env } from './env.js'
import { sendMagicLinkEmail } from './magicLinkEmail.js'

/**
 * Combined entrypoint for Render's free tier, which has no Background
 * Worker service type - the API and the poll/nightly worker loops run in
 * this one process instead of as separate services. See apps/worker/src/run.ts
 * for the loop logic itself (shared, not duplicated) and index.ts for the
 * standalone worker entrypoint this replaces when apps/worker ever gets its
 * own paid Background Worker service.
 */
const auth = createAuth(db, sendMagicLinkEmail)
const app = createApp({ db, auth, channelRegistry })

startWorker({ db, channelRegistry })

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api+worker listening on http://localhost:${info.port}`)
})
