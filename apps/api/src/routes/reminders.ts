import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { notificationJobSchema } from '@reminder/core'
import { schema } from '@reminder/db'
import { and, asc, eq } from 'drizzle-orm'
import { toJobDto } from '../lib/dto.js'
import { type AuthedVariables, createRequireAuth } from '../middleware/session.js'
import type { AppDeps } from '../types.js'

const query = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export function createReminderRoutes(deps: AppDeps) {
  const { db } = deps
  const reminderRoutes = new OpenAPIHono<{ Variables: AuthedVariables }>()
  reminderRoutes.use('/v1/reminders/upcoming', createRequireAuth(deps.auth))

  const route = createRoute({
    method: 'get',
    path: '/v1/reminders/upcoming',
    request: { query },
    responses: {
      200: {
        content: { 'application/json': { schema: z.array(notificationJobSchema) } },
        description: 'Next N pending jobs, for the UI preview',
      },
    },
  })

  reminderRoutes.openapi(route, async (c) => {
    const userId = c.get('userId')
    const { limit } = c.req.valid('query')

    const rows = await db
      .select({ job: schema.notificationJobs })
      .from(schema.notificationJobs)
      .innerJoin(
        schema.subscriptions,
        eq(schema.notificationJobs.subscriptionId, schema.subscriptions.id),
      )
      .where(
        and(eq(schema.subscriptions.userId, userId), eq(schema.notificationJobs.status, 'pending')),
      )
      .orderBy(asc(schema.notificationJobs.sendAt))

    // materializeJobs() keeps a second renewal occurrence pre-booked
    // (packages/core/src/scheduling.ts) so the worker never has a gap right
    // after a rollover, but that lookahead occurrence isn't a real "upcoming
    // reminder" yet - only the nearest occurrence per subscription+kind is,
    // so filter the rest out here rather than surfacing it to the user.
    const nearestOccurrenceByGroup = new Map<string, string>()
    for (const { job } of rows) {
      const groupKey = `${job.subscriptionId}:${job.kind}`
      const nearest = nearestOccurrenceByGroup.get(groupKey)
      if (nearest === undefined || job.occurrenceDate < nearest) {
        nearestOccurrenceByGroup.set(groupKey, job.occurrenceDate)
      }
    }

    const upcoming = rows
      .filter(
        ({ job }) =>
          nearestOccurrenceByGroup.get(`${job.subscriptionId}:${job.kind}`) === job.occurrenceDate,
      )
      .slice(0, limit)

    return c.json(
      upcoming.map((r) => toJobDto(r.job)),
      200,
    )
  })

  return reminderRoutes
}
