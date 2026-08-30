import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { createAuth, type SendMagicLink } from './auth.js'
import { channelRegistry } from './channels.js'
import { db } from './db.js'
import { env } from './env.js'
import { sendMagicLinkEmail } from './magicLinkEmail.js'

const devLogMagicLink: SendMagicLink = async (email, url) => {
  console.log(`[DEV_LOG_MAGIC_LINK] sign-in link for ${email}:\n${url}`)
}

const auth = createAuth(db, env.DEV_LOG_MAGIC_LINK ? devLogMagicLink : sendMagicLinkEmail)
const app = createApp({ db, auth, channelRegistry })

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`api listening on http://localhost:${info.port}`)
})
