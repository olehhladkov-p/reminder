import type { ReminderPayload } from '@reminder/channels'
import type { schema } from '@reminder/db'
import { env } from './env.js'

type NotificationJobRow = typeof schema.notificationJobs.$inferSelect
type SubscriptionRow = typeof schema.subscriptions.$inferSelect

// WEB_APP_ORIGIN may be a comma-separated allowlist (see apps/api's env.ts) -
// a link only ever needs one canonical origin to point at.
const webAppOrigin = env.WEB_APP_ORIGIN.split(',')[0]?.trim()

export function buildReminderPayload(
  job: NotificationJobRow,
  subscription: SubscriptionRow,
): ReminderPayload {
  return {
    subscriptionName: subscription.name,
    renewalDate: job.occurrenceDate,
    // The digest fires exactly `leadDays` before the occurrence by
    // construction (see computeSendAt in @reminder/core), so this needs no
    // separate date math.
    daysUntil: job.leadDays,
    kind: job.kind,
    priceDisplay: formatPrice(subscription.priceCents, subscription.currency),
    cancelUrl: subscription.cancelUrl ?? undefined,
    deepLink: `${webAppOrigin}/subscriptions/${subscription.id}`,
    // Stable across retries of this same job, so a channel that supports
    // provider-side idempotency (email/Resend) never double-sends it even
    // if the worker crashes between a successful send and recording it.
    idempotencyKey: job.id,
  }
}

function formatPrice(priceCents: number | null, currency: string | null): string | undefined {
  if (priceCents === null || !currency) return undefined
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(
      priceCents / 100,
    )
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`
  }
}
