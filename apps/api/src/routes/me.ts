import { createRoute, OpenAPIHono } from '@hono/zod-openapi'
import { normalizeLeadDays, updateUserSchema, userSchema } from '@reminder/core'
import { reconcileUserJobs, schema } from '@reminder/db'
import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { toUserDto } from '../lib/dto.js'
import { type AuthedVariables, createRequireAuth } from '../middleware/session.js'
import type { AppDeps } from '../types.js'

export function createMeRoutes(deps: AppDeps) {
  const { db } = deps
  const meRoutes = new OpenAPIHono<{ Variables: AuthedVariables }>()
  meRoutes.use('/v1/me', createRequireAuth(deps.auth))

  const getRoute = createRoute({
    method: 'get',
    path: '/v1/me',
    responses: {
      200: { content: { 'application/json': { schema: userSchema } }, description: 'Current user' },
    },
  })

  meRoutes.openapi(getRoute, async (c) => {
    const [row] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, c.get('userId')))
    if (!row) throw new HTTPException(404, { message: 'not found' })
    return c.json(toUserDto(row), 200)
  })

  const patchRoute = createRoute({
    method: 'patch',
    path: '/v1/me',
    request: { body: { content: { 'application/json': { schema: updateUserSchema } } } },
    responses: {
      200: { content: { 'application/json': { schema: userSchema } }, description: 'Updated user' },
    },
  })

  meRoutes.openapi(patchRoute, async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')

    const [row] = await db
      .update(schema.users)
      .set({
        ...(body.timezone !== undefined && { timezone: body.timezone }),
        ...(body.defaultLeadDays !== undefined && {
          defaultLeadDays: normalizeLeadDays(body.defaultLeadDays),
        }),
        ...(body.digestLocalTime !== undefined && { digestLocalTime: body.digestLocalTime }),
        ...(body.theme !== undefined && { theme: body.theme }),
        ...(body.colorMode !== undefined && { colorMode: body.colorMode }),
      })
      .where(eq(schema.users.id, userId))
      .returning()
    if (!row) throw new HTTPException(404, { message: 'not found' })

    // Timezone, digest time, and default lead days all feed materializeJobs()
    // for every one of this user's active subscriptions.
    if (
      body.timezone !== undefined ||
      body.digestLocalTime !== undefined ||
      body.defaultLeadDays !== undefined
    ) {
      await reconcileUserJobs(db, userId)
    }

    return c.json(toUserDto(row), 200)
  })

  return meRoutes
}
