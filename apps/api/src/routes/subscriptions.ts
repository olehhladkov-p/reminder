import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import {
  advance,
  createSubscriptionSchema,
  formatIsoDate,
  normalizeLeadDays,
  parseIsoDate,
  subscriptionSchema,
  subscriptionStatusSchema,
  updateSubscriptionSchema,
} from '@reminder/core'
import { reconcileSubscriptionJobs, schema } from '@reminder/db'
import { and, asc, eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'
import { toSubscriptionDto } from '../lib/dto.js'
import { requireOwnership } from '../lib/requireOwnership.js'
import { type AuthedVariables, createRequireAuth } from '../middleware/session.js'
import type { AppDeps } from '../types.js'

const idParams = z.object({
  id: z
    .string()
    .uuid()
    .openapi({ param: { name: 'id', in: 'path' } }),
})

const listQuery = z.object({
  status: subscriptionStatusSchema.optional(),
  sort: z.enum(['next_renewal_date']).optional(),
})

export function createSubscriptionRoutes(deps: AppDeps) {
  const { db } = deps
  const subscriptionRoutes = new OpenAPIHono<{ Variables: AuthedVariables }>()
  const requireAuth = createRequireAuth(deps.auth)
  subscriptionRoutes.use('/v1/subscriptions/*', requireAuth)
  subscriptionRoutes.use('/v1/subscriptions', requireAuth)

  async function findOwned(id: string, userId: string) {
    const [row] = await db
      .select()
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.id, id))
    return requireOwnership(row, userId)
  }

  const listRoute = createRoute({
    method: 'get',
    path: '/v1/subscriptions',
    request: { query: listQuery },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(subscriptionSchema) } },
        description: 'Subscriptions sorted by soonest renewal',
      },
    },
  })

  subscriptionRoutes.openapi(listRoute, async (c) => {
    const userId = c.get('userId')
    const { status } = c.req.valid('query')
    const rows = await db
      .select()
      .from(schema.subscriptions)
      .where(
        status
          ? and(eq(schema.subscriptions.userId, userId), eq(schema.subscriptions.status, status))
          : eq(schema.subscriptions.userId, userId),
      )
      .orderBy(asc(schema.subscriptions.nextRenewalDate))
    return c.json(rows.map(toSubscriptionDto), 200)
  })

  const createRouteDef = createRoute({
    method: 'post',
    path: '/v1/subscriptions',
    request: { body: { content: { 'application/json': { schema: createSubscriptionSchema } } } },
    responses: {
      201: {
        content: { 'application/json': { schema: subscriptionSchema } },
        description: 'Created subscription',
      },
    },
  })

  subscriptionRoutes.openapi(createRouteDef, async (c) => {
    const userId = c.get('userId')
    const body = c.req.valid('json')
    const anchorDay = parseIsoDate(body.nextRenewalDate).day

    const [row] = await db
      .insert(schema.subscriptions)
      .values({
        userId,
        name: body.name,
        nextRenewalDate: body.nextRenewalDate,
        cycle: body.cycle,
        intervalDays: body.intervalDays ?? null,
        anchorDay,
        priceCents: body.priceCents ?? null,
        currency: body.currency ?? null,
        leadDays: body.leadDays ? normalizeLeadDays(body.leadDays) : null,
        trialEndsAt: body.trialEndsAt ?? null,
        trialLeadDays: body.trialLeadDays ? normalizeLeadDays(body.trialLeadDays) : null,
        cancelUrl: body.cancelUrl ?? null,
        notes: body.notes ?? null,
      })
      .returning()
    if (!row) throw new HTTPException(500, { message: 'insert failed' })

    await reconcileSubscriptionJobs(db, row.id)
    return c.json(toSubscriptionDto(row), 201)
  })

  const getRoute = createRoute({
    method: 'get',
    path: '/v1/subscriptions/{id}',
    request: { params: idParams },
    responses: {
      200: {
        content: { 'application/json': { schema: subscriptionSchema } },
        description: 'One subscription',
      },
    },
  })

  subscriptionRoutes.openapi(getRoute, async (c) => {
    const { id } = c.req.valid('param')
    const row = await findOwned(id, c.get('userId'))
    return c.json(toSubscriptionDto(row), 200)
  })

  const patchRoute = createRoute({
    method: 'patch',
    path: '/v1/subscriptions/{id}',
    request: {
      params: idParams,
      body: { content: { 'application/json': { schema: updateSubscriptionSchema } } },
    },
    responses: {
      200: {
        content: { 'application/json': { schema: subscriptionSchema } },
        description: 'Updated subscription',
      },
    },
  })

  subscriptionRoutes.openapi(patchRoute, async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    const body = c.req.valid('json')
    await findOwned(id, userId)

    const [row] = await db
      .update(schema.subscriptions)
      .set({
        ...(body.name !== undefined && { name: body.name }),
        // Editing the renewal date directly re-anchors the month-end clamp day.
        ...(body.nextRenewalDate !== undefined && {
          nextRenewalDate: body.nextRenewalDate,
          anchorDay: parseIsoDate(body.nextRenewalDate).day,
        }),
        ...(body.cycle !== undefined && { cycle: body.cycle }),
        ...(body.intervalDays !== undefined && { intervalDays: body.intervalDays }),
        ...(body.priceCents !== undefined && { priceCents: body.priceCents }),
        ...(body.currency !== undefined && { currency: body.currency }),
        ...(body.leadDays !== undefined && {
          leadDays: body.leadDays ? normalizeLeadDays(body.leadDays) : null,
        }),
        ...(body.trialEndsAt !== undefined && { trialEndsAt: body.trialEndsAt }),
        ...(body.trialLeadDays !== undefined && {
          trialLeadDays: body.trialLeadDays ? normalizeLeadDays(body.trialLeadDays) : null,
        }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.cancelUrl !== undefined && { cancelUrl: body.cancelUrl }),
        ...(body.notes !== undefined && { notes: body.notes }),
      })
      .where(eq(schema.subscriptions.id, id))
      .returning()
    if (!row) throw new HTTPException(500, { message: 'update failed' })

    await reconcileSubscriptionJobs(db, id)
    return c.json(toSubscriptionDto(row), 200)
  })

  const deleteRoute = createRoute({
    method: 'delete',
    path: '/v1/subscriptions/{id}',
    request: { params: idParams },
    responses: { 204: { description: 'Deleted' } },
  })

  subscriptionRoutes.openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid('param')
    await findOwned(id, c.get('userId'))
    // ON DELETE CASCADE takes its notification_jobs (pending and sent) with it.
    await db.delete(schema.subscriptions).where(eq(schema.subscriptions.id, id))
    return c.body(null, 204)
  })

  const renewRoute = createRoute({
    method: 'post',
    path: '/v1/subscriptions/{id}/renew',
    request: { params: idParams },
    responses: {
      200: {
        content: { 'application/json': { schema: subscriptionSchema } },
        description: 'Rolled forward one cycle',
      },
    },
  })

  subscriptionRoutes.openapi(renewRoute, async (c) => {
    const { id } = c.req.valid('param')
    const userId = c.get('userId')
    const existing = await findOwned(id, userId)

    const nextDate = advance(parseIsoDate(existing.nextRenewalDate), existing.cycle, {
      anchorDay: existing.anchorDay,
      intervalDays: existing.intervalDays,
    })

    const [row] = await db
      .update(schema.subscriptions)
      .set({ nextRenewalDate: formatIsoDate(nextDate) })
      .where(eq(schema.subscriptions.id, id))
      .returning()
    if (!row) throw new HTTPException(500, { message: 'renew failed' })

    // reconcileSubscriptionJobs deletes pending jobs and regenerates from the
    // new date; jobs already `sent` are untouched.
    await reconcileSubscriptionJobs(db, id)
    return c.json(toSubscriptionDto(row), 200)
  })

  function statusChangeRoute(action: 'pause' | 'resume', targetStatus: 'paused' | 'active') {
    const route = createRoute({
      method: 'post',
      path: `/v1/subscriptions/{id}/${action}`,
      request: { params: idParams },
      responses: {
        200: {
          content: { 'application/json': { schema: subscriptionSchema } },
          description: `Subscription ${targetStatus}`,
        },
      },
    })

    subscriptionRoutes.openapi(route, async (c) => {
      const { id } = c.req.valid('param')
      const userId = c.get('userId')
      await findOwned(id, userId)

      const [row] = await db
        .update(schema.subscriptions)
        .set({ status: targetStatus })
        .where(eq(schema.subscriptions.id, id))
        .returning()
      if (!row) throw new HTTPException(500, { message: `${action} failed` })

      await reconcileSubscriptionJobs(db, id)
      return c.json(toSubscriptionDto(row), 200)
    })
  }

  statusChangeRoute('pause', 'paused')
  statusChangeRoute('resume', 'active')

  return subscriptionRoutes
}
