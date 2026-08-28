/**
 * Plain calendar dates (year/month/day, no time-of-day, no timezone).
 * `next_renewal_date`, `trial_ends_at`, and `occurrence_date` are all
 * SQL `date` columns — modeling them as PlainDate instead of JS `Date`
 * sidesteps local-timezone-offset footguns in date arithmetic.
 */
export interface PlainDate {
  year: number
  month: number // 1-12
  day: number
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29
  const days = DAYS_IN_MONTH[month - 1]
  if (days === undefined) throw new Error(`invalid month: ${month}`)
  return days
}

export function parseIsoDate(iso: string): PlainDate {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) throw new Error(`invalid ISO date: ${iso}`)
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) }
}

export function formatIsoDate(date: PlainDate): string {
  const y = String(date.year).padStart(4, '0')
  const m = String(date.month).padStart(2, '0')
  const d = String(date.day).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function comparePlainDates(a: PlainDate, b: PlainDate): number {
  if (a.year !== b.year) return a.year - b.year
  if (a.month !== b.month) return a.month - b.month
  return a.day - b.day
}

export function addDaysPlain(date: PlainDate, days: number): PlainDate {
  const epochMs = Date.UTC(date.year, date.month - 1, date.day) + days * 86_400_000
  const result = new Date(epochMs)
  return {
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate(),
  }
}

/**
 * Adds whole months, then clamps the day-of-month to the target month's
 * length. `anchorDay` (not the source date's day) is the clamp target,
 * so Jan 31 -> Feb 28 -> Mar 31 rather than drifting to Mar 28 the way a
 * naive "add one month to Feb 28" would.
 */
export function addMonthsClamped(
  date: PlainDate,
  monthsToAdd: number,
  anchorDay: number,
): PlainDate {
  const totalMonths = date.year * 12 + (date.month - 1) + monthsToAdd
  const newYear = Math.floor(totalMonths / 12)
  const newMonth = (((totalMonths % 12) + 12) % 12) + 1
  const clampedDay = Math.min(anchorDay, daysInMonth(newYear, newMonth))
  return { year: newYear, month: newMonth, day: clampedDay }
}
