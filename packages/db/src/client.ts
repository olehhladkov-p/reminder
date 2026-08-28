import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { PgliteDatabase } from 'drizzle-orm/pglite'
import { Pool } from 'pg'
import * as authSchema from './authSchema.js'
import * as domainSchema from './schema.js'

const schema = { ...domainSchema, ...authSchema }

/**
 * Driver-agnostic so callers can pass either the real node-postgres db
 * (production) or an in-memory PGlite db (tests) into reconcileSubscriptionJobs
 * / reconcileUserJobs - both expose the same query builder surface.
 */
export type Db = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>

export interface CreateDbResult {
  pool: Pool
  db: NodePgDatabase<typeof schema>
}

/**
 * `connectionString` should be the pooled Neon connection string at runtime
 * (api/worker) and the direct/unpooled one for drizzle-kit migrations.
 *
 * The combined schema (domain + better-auth tables) is what lets
 * drizzleAdapter(db, { schema: authSchema }) share the same pool/connection
 * as the rest of the app instead of opening a second one.
 */
export function createDb(connectionString: string): CreateDbResult {
  const pool = new Pool({ connectionString })
  const db = drizzle(pool, { schema })
  return { pool, db }
}
