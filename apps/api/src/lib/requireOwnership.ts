import { HTTPException } from 'hono/http-exception'

/**
 * The one ownership check, used everywhere a row is fetched by id. Returns
 * 404 (not 403) on a mismatch so we never confirm to a caller that some
 * other user's row exists.
 */
export function requireOwnership<T extends { userId: string }>(
  row: T | undefined,
  userId: string,
): T {
  if (!row || row.userId !== userId) {
    throw new HTTPException(404, { message: 'not found' })
  }
  return row
}
