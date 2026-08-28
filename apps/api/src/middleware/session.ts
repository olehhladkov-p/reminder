import { createMiddleware } from 'hono/factory'
import { HTTPException } from 'hono/http-exception'
import type { Auth } from '../auth.js'

export interface AuthedVariables {
  userId: string
}

/** Rejects with 401 if there's no active session; otherwise sets `userId` on context. */
export function createRequireAuth(auth: Auth) {
  return createMiddleware<{ Variables: AuthedVariables }>(async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) {
      throw new HTTPException(401, { message: 'unauthorized' })
    }
    c.set('userId', session.user.id)
    await next()
  })
}
