import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { getLastDevMagicLink } from './devMagicLinkStore.js'
import { env, webAppOrigins } from './env.js'
import { createChannelRoutes } from './routes/channels.js'
import { createDeviceRoutes } from './routes/devices.js'
import { createMeRoutes } from './routes/me.js'
import { createReminderRoutes } from './routes/reminders.js'
import { createSubscriptionRoutes } from './routes/subscriptions.js'
import type { AppDeps } from './types.js'

export function createApp(deps: AppDeps) {
  const app = new OpenAPIHono()

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse()
    console.error(err)
    return c.json({ error: 'internal server error' }, 500)
  })

  // The PWA is served from a separate origin - see webAppOrigins in env.js.
  app.use('*', cors({ origin: webAppOrigins, credentials: true }))

  // Unauthenticated liveness check; also doubles as the target for an
  // external keep-alive ping to stop Render's free tier from spinning the
  // service down after 15 minutes of no HTTP traffic.
  app.get('/health', (c) => c.json({ ok: true }))

  // Dev convenience only (see DEV_LOG_MAGIC_LINK in env.ts): lets the web
  // app fetch the most recently issued magic-link URL and display it
  // directly, instead of the developer having to go find it in server logs.
  // 404s outright when the flag is off, so this doesn't exist as an attack
  // surface anywhere real users sign in.
  app.get('/v1/dev/magic-link', (c) => {
    if (!env.DEV_LOG_MAGIC_LINK) return c.notFound()
    const last = getLastDevMagicLink()
    if (!last) return c.notFound()
    return c.json(last)
  })

  app.on(['GET', 'POST'], '/v1/auth/*', (c) => deps.auth.handler(c.req.raw))

  app.route('/', createMeRoutes(deps))
  app.route('/', createSubscriptionRoutes(deps))
  app.route('/', createChannelRoutes(deps))
  app.route('/', createDeviceRoutes(deps))
  app.route('/', createReminderRoutes(deps))

  app.doc('/v1/openapi.json', {
    openapi: '3.0.0',
    info: { title: 'Subscription Reminders API', version: '0.1.0' },
  })

  return app
}
