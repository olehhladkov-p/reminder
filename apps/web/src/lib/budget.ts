import {
  addDaysPlain,
  advance,
  comparePlainDates,
  formatIsoDate,
  type PlainDate,
  parseIsoDate,
  type Subscription,
} from '@reminder/core'
import { type ExchangeRates, toEur } from './currency.js'

function dateToPlainDate(date: Date): PlainDate {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function priceInEur(sub: Subscription, rates: ExchangeRates): number {
  if (sub.priceCents === null) return 0
  return toEur(sub.priceCents / 100, sub.currency, rates)
}

// Backstop against runaway loops if a subscription's cycle math never
// reaches "today" (mirrors the worker's rollOverDueSubscriptions guard).
const MAX_ELAPSED_STEPS = 5000

/**
 * Number of billing occurrences strictly after `windowStart` and up to
 * `windowEnd`, walking forward one cycle at a time from `start`. Passing
 * `start` itself as `windowStart` counts every occurrence since `start`;
 * passing a more recent date narrows to occurrences in that window only.
 */
function occurrenceCount(
  sub: Subscription,
  start: PlainDate,
  windowStart: PlainDate,
  windowEnd: PlainDate,
): number {
  let cursor = start
  let count = 0
  for (let steps = 0; steps < MAX_ELAPSED_STEPS; steps++) {
    const next = advance(cursor, sub.cycle, {
      anchorDay: sub.anchorDay,
      intervalDays: sub.intervalDays,
    })
    if (comparePlainDates(next, windowEnd) > 0) break
    if (comparePlainDates(next, windowStart) > 0) count++
    cursor = next
  }
  return count
}

export interface BudgetSummary {
  /** Sum of billing occurrences in the last 30 days, converted to EUR. */
  last30DaysEur: number
  /** Sum of active subscriptions renewing in the next 30 days, converted to EUR. */
  upcomingMonthEur: number
  /** Estimated lifetime spend across all subscriptions since the earliest one was added. */
  totalSinceStartEur: number
  /** ISO date the earliest subscription was created, or null if there are none. */
  periodStart: string | null
}

export function computeBudgetSummary(
  subscriptions: readonly Subscription[],
  rates: ExchangeRates,
  now: Date = new Date(),
): BudgetSummary {
  const today = dateToPlainDate(now)
  const horizon = addDaysPlain(today, 30)
  const last30DaysStart = addDaysPlain(today, -30)

  const upcomingMonthEur = subscriptions
    .filter((s) => {
      if (s.status !== 'active') return false
      const renewal = parseIsoDate(s.nextRenewalDate)
      return comparePlainDates(renewal, today) >= 0 && comparePlainDates(renewal, horizon) <= 0
    })
    .reduce((sum, s) => sum + priceInEur(s, rates), 0)

  const periodStartDate = subscriptions.reduce<Date | null>(
    (earliest, s) => (earliest === null || s.createdAt < earliest ? s.createdAt : earliest),
    null,
  )

  const totalSinceStartEur = subscriptions.reduce((sum, s) => {
    const start = dateToPlainDate(s.createdAt)
    return sum + occurrenceCount(s, start, start, today) * priceInEur(s, rates)
  }, 0)

  const last30DaysEur = subscriptions.reduce((sum, s) => {
    const start = dateToPlainDate(s.createdAt)
    return sum + occurrenceCount(s, start, last30DaysStart, today) * priceInEur(s, rates)
  }, 0)

  return {
    last30DaysEur,
    upcomingMonthEur,
    totalSinceStartEur,
    periodStart: periodStartDate ? formatIsoDate(dateToPlainDate(periodStartDate)) : null,
  }
}
