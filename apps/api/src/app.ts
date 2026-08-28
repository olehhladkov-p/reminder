import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { HTTPException } from 'hono/http-exception'
import { webAppOrigins } from './env.js'
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
