import { addDaysPlain, addMonthsClamped, type PlainDate } from './dates.js'
import type { Cycle } from './schemas.js'

export interface AdvanceOptions {
  /** Day-of-month the subscription is anchored to; used to clamp month-based cycles. */
  anchorDay: number
  /** Required, and only meaningful, when cycle is 'custom_days'. */
  intervalDays?: number | null
}

/**
 * Moves a date forward exactly one cycle. Month-based cycles clamp to
 * `anchorDay` rather than the input date's day-of-month, so repeated calls
 * on a month-end anchor don't drift (Jan 31 -> Feb 28 -> Mar 31, not
 * Feb 28 -> Mar 28).
 */
export function advance(date: PlainDate, cycle: Cycle, options: AdvanceOptions): PlainDate {
  switch (cycle) {
    case 'weekly':
      return addDaysPlain(date, 7)
    case 'monthly':
      return addMonthsClamped(date, 1, options.anchorDay)
    case 'quarterly':
      return addMonthsClamped(date, 3, options.anchorDay)
    case 'yearly':
      return addMonthsClamped(date, 12, options.anchorDay)
    case 'custom_days': {
      const interval = options.intervalDays
      if (!interval || interval < 1) {
        throw new Error('advance: custom_days cycle requires a positive intervalDays')
      }
      return addDaysPlain(date, interval)
    }
    default: {
      const exhaustive: never = cycle
      throw new Error(`advance: unknown cycle ${String(exhaustive)}`)
    }
  }
}
