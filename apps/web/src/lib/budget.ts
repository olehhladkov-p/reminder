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

/** Number of full billing cycles completed between `start` and `today`. */
function elapsedCycles(sub: Subscription, start: PlainDate, today: PlainDate): number {
  let cursor = start
  let count = 0
  for (; count < MAX_ELAPSED_STEPS; count++) {
    const next = advance(cursor, sub.cycle, {
      anchorDay: sub.anchorDay,
      intervalDays: sub.intervalDays,
    })
    if (comparePlainDates(next, today) > 0) break
    cursor = next
  }
  return count
}

export interface BudgetSummary {
  /** Sum of every currently-active subscription's price, converted to EUR. */
  activeCostEur: number
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

  const activeCostEur = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + priceInEur(s, rates), 0)

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
    return sum + elapsedCycles(s, start, today) * priceInEur(s, rates)
  }, 0)

  return {
    activeCostEur,
    upcomingMonthEur,
    totalSinceStartEur,
    periodStart: periodStartDate ? formatIsoDate(dateToPlainDate(periodStartDate)) : null,
  }
}
