import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { channelConfigSchema, createChannelConfigSchema } from '@reminder/core'
import { reconcileUserJobs, schema } from '@reminder/db'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { toChannelDto } from '../lib/dto.js'
import { requireOwnership } from '../lib/requireOwnership.js'
import { type AuthedVariables, createRequireAuth } from '../middleware/session.js'
import type { AppDeps } from '../types.js'

const idParams = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
})

export function createChannelRoutes(deps: AppDeps) {
  const { db, channelRegistry } = deps
  const channelRoutes = new OpenAPIHono<{ Variables: AuthedVariables }>()
  const requireAuth = createRequireAuth(deps.auth)
  channelRoutes.use('/v1/channels/*', requireAuth)
  channelRoutes.use('/v1/channels', requireAuth)

  async function findOwned(id: string, userId: string) {
    const [row] = await db
      .select()
      .from(schema.channelConfigs)
      .where(eq(schema.channelConfigs.id, id))
    return requireOwnership(row, userId)
  }

  const listRoute = createRoute({
    method: 'get',
    path: '/v1/channels',
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(channelConfigSchema) } },
        description: "The user's notification channels",
      },
    },
  })

  channelRoutes.openapi(listRoute, async (c) => {
    const rows = await db
      .select()
      .from(schema.channelConfigs)
      .where(eq(schema.channelConfigs.userId, c.get('userId')))
    return c.json(rows.map(toChannelDto), 200)
  })

  const createRouteDef = createRoute({
    method: 'post',
    path: '/v1/channels',
    request: { body: { content: { 'application/json': { schema: createChannelConfigSchema } } } },
    responses: {
      201: {
        content: { 'application/json': { schema: channelConfigSchema } },
        description: 'Created channel',
      },
      400: {
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
        description: 'Unsupported type or invalid target',
      },
    },
  })

  channelRoutes.openapi(createRouteDef, async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')

    const adapter = channelRegistry.get(body.type)
    if (!adapter) {
      return c.json({ error: `channel type "${body.type}" is not supported yet` }, 400)
    }
    const validated = adapter.validateTarget(body.target)
    if (!validated.ok) {
      return c.json({ error: validated.error }, 400)
    }

    const [row] = await db
      .insert(schema.channelConfigs)
      .values({ userId, type: body.type, target: body.target, enabled: body.enabled })
      .returning()
    if (!row) throw new HTTPException(500, { message: 'insert failed' })

    await reconcileUserJobs(db, userId)
    return c.json(toChannelDto(row), 201)
  })

  const patchRoute = createRoute({
    method: 'patch',
    path: '/v1/channels/{id}',
    request: {
      params: idParams,
      body: {
        content: {
          'application/json': {
            schema: z.object({
              target: z.record(z.unknown()).optional(),
              enabled: z.boolean().optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: channelConfigSchema } },
        description: 'Updated channel',
      },
      400: {
        content: { 'application/json': { schema: z.object({ error: z.string() }) } },
        description: 'Invalid target',
      },
    },
  })

  channelRoutes.openapi(patchRoute, async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    const body = c.req.valid('json')
    const existing = await findOwned(id, userId)

    if (body.target !== undefined) {
      const adapter = channelRegistry.get(existing.type)
      const validated = adapter?.validateTarget(body.target)
      if (validated && !validated.ok) {
        return c.json({ error: validated.error }, 400)
      }
    }

    const [row] = await db
      .update(schema.channelConfigs)
      .set({
        ...(body.target !== undefined && { target: body.target, verifiedAt: null }),
        ...(body.enabled !== undefined && { enabled: body.enabled }),
      })
      .where(eq(schema.channelConfigs.id, id))
      .returning()
    if (!row) throw new HTTPException(500, { message: 'update failed' })

    await reconcileUserJobs(db, userId)
    return c.json(toChannelDto(row), 200)
  })

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/v1/channels/{id}',
    request: { params: idParams },
    responses: { 204: { description: 'Deleted' } },
  })

  channelRoutes.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    await findOwned(id, userId)
    // ON DELETE CASCADE takes its notification_jobs with it.
    await db.delete(schema.channelConfigs).where(eq(schema.channelConfigs.id, id))
    await reconcileUserJobs(db, userId)
    return c.body(null, 204)
  })

  const verifyRoute = createRoute({
    method: 'post',
    path: '/v1/channels/{id}/verify',
    request: { params: idParams },
    responses: {
      200: {
        content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } },
        description: 'Test notification sent',
      },
      502: {
        content: {
          'application/json': { schema: z.object({ ok: z.literal(false), error: z.string() }) },
        },
        description: 'Provider rejected the test notification',
      },
    },
  })

  channelRoutes.openapi(verifyRoute, async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    const existing = await findOwned(id, userId)

    const adapter = channelRegistry.get(existing.type)
    if (!adapter) {
      return c.json(
        { ok: false as const, error: `channel type "${existing.type}" is not supported yet` },
        502,
      )
    }
    const validated = adapter.validateTarget(existing.target)
    if (!validated.ok) {
      return c.json({ ok: false as const, error: validated.error }, 502)
    }

    const result = await adapter.send(
      {
        subscriptionName: 'Test Subscription',
        renewalDate: new Date().toISOString().slice(0, 10),
        daysUntil: 7,
        kind: 'renewal',
        deepLink: 'reminder://subscriptions',
      },
      validated.value,
    )

    if (!result.ok) {
      return c.json({ ok: false as const, error: result.error ?? 'send failed' }, 502)
    }

    await db
      .update(schema.channelConfigs)
      .set({ verifiedAt: new Date() })
      .where(eq(schema.channelConfigs.id, id))
    return c.json({ ok: true as const }, 200)
  })

  return channelRoutes
}
