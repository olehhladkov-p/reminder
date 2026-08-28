import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createAuth } from './auth.js'
import { channelRegistry } from './channels.js'
import { db } from './db.js'
import { env } from './env.js'
import { sendMagicLinkEmail } from './magicLinkEmail.js'

const auth = createAuth(db, sendMagicLinkEmail)
const app = createApp({ db, auth, channelRegistry })

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`)
})
