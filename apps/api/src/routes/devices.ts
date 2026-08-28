import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { channelConfigSchema, type WebPushTarget, webPushTargetSchema } from '@reminder/core'
import { reconcileUserJobs, schema } from '@reminder/db'
import { and, eq, sql } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { toChannelDto } from '../lib/dto.js'
import { type AuthedVariables, createRequireAuth } from '../middleware/session.js'
import type { AppDeps } from '../types.js'

const bodySchema = webPushTargetSchema

export function createDeviceRoutes(deps: AppDeps) {
  const { db, channelRegistry } = deps
  const deviceRoutes = new OpenAPIHono<{ Variables: AuthedVariables }>()
  deviceRoutes.use('/v1/devices', createRequireAuth(deps.auth))

  // A device registration is just a push-type channel_config, upserted by
  // endpoint - there's no separate `devices` table in the data model.
  const registerRoute = createRoute({
    method: 'post',
    path: '/v1/devices',
    request: { body: { content: { 'application/json': { schema: bodySchema } } } },
    responses: {
      200: {
        content: { 'application/json': { schema: channelConfigSchema } },
        description: 'Existing subscription refreshed',
      },
      201: {
        content: { 'application/json': { schema: channelConfigSchema } },
        description: 'New push subscription registered',
      },
      400: {
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
        description: 'Invalid push subscription',
      },
    },
  })

  deviceRoutes.openapi(registerRoute, async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')

    const pushAdapter = channelRegistry.get('push')
    const validated = pushAdapter?.validateTarget(body)
    if (!validated?.ok) {
      return c.json({ error: validated?.error ?? 'push channel unavailable' }, 400)
    }

    const [existing] = await db
      .select()
      .from(schema.channelConfigs)
      .where(
        and(
          eq(schema.channelConfigs.userId, userId),
          eq(schema.channelConfigs.type, 'push'),
          sql`${schema.channelConfigs.target}->>'endpoint' = ${body.endpoint}`,
        ),
      )

    if (existing) {
      const [row] = await db
        .update(schema.channelConfigs)
        .set({ target: validated.value as WebPushTarget, enabled: true })
        .where(eq(schema.channelConfigs.id, existing.id))
        .returning()
      if (!row) throw new HTTPException(500, { message: 'update failed' })
      return c.json(toChannelDto(row), 200)
    }

    const [row] = await db
      .insert(schema.channelConfigs)
      .values({ userId, type: 'push', target: validated.value as WebPushTarget, enabled: true })
      .returning()
    if (!row) throw new HTTPException(500, { message: 'insert failed' })

    await reconcileUserJobs(db, userId)
    return c.json(toChannelDto(row), 201)
  })

  return deviceRoutes
}
