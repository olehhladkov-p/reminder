import { describe, expect, it } from 'vitest'
import { formatIsoDate, parseIsoDate } from './dates.js'
import { advance } from './recurrence.js'

describe('advance - monthly month-end clamping', () => {
  it('walks Jan 31 forward 14 months without drifting off the anchor day', () => {
    // Starts in a non-leap year so the narrative case (Jan 31 -> Feb 28 -> Mar 31)
    // is exercised directly, then crosses into a leap year to confirm recovery
    // back to day 31 doesn't get stuck at 28/29.
    let date = parseIsoDate('2023-01-31')
    const anchorDay = 31
    const results: string[] = []
    for (let i = 0; i < 14; i++) {
      date = advance(date, 'monthly', { anchorDay })
      results.push(formatIsoDate(date))
    }

    expect(results).toEqual([
      '2023-02-28',
      '2023-03-31', // must be 31, not 28 - proves anchorDay clamping, not naive addMonths
      '2023-04-30',
      '2023-05-31',
      '2023-06-30',
      '2023-07-31',
      '2023-08-31',
      '2023-09-30',
      '2023-10-31',
      '2023-11-30',
      '2023-12-31',
      '2024-01-31',
      '2024-02-29', // leap year
      '2024-03-31',
    ])
  })
})

describe('advance - yearly across a leap year (Feb 29 anchor)', () => {
  it('clamps to Feb 28 in non-leap years and returns to Feb 29 in the next leap year', () => {
    let date = parseIsoDate('2024-02-29')
    const anchorDay = 29
    const results: string[] = []
    for (let i = 0; i < 4; i++) {
      date = advance(date, 'yearly', { anchorDay })
      results.push(formatIsoDate(date))
    }

    expect(results).toEqual([
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29', // next leap year - back to the true anchor day
    ])
  })
})

describe('advance - other cycles', () => {
  it('weekly adds 7 days', () => {
    const date = parseIsoDate('2026-01-01')
    expect(formatIsoDate(advance(date, 'weekly', { anchorDay: 1 }))).toBe('2026-01-08')
  })

  it('quarterly adds 3 months with clamping', () => {
    const date = parseIsoDate('2025-11-30')
    expect(formatIsoDate(advance(date, 'quarterly', { anchorDay: 30 }))).toBe('2026-02-28')
  })

  it('custom_days adds intervalDays', () => {
    const date = parseIsoDate('2026-01-01')
    expect(formatIsoDate(advance(date, 'custom_days', { anchorDay: 1, intervalDays: 45 }))).toBe(
      '2026-02-15',
    )
  })

  it('custom_days without a positive intervalDays throws', () => {
    const date = parseIsoDate('2026-01-01')
    expect(() => advance(date, 'custom_days', { anchorDay: 1 })).toThrow()
    expect(() => advance(date, 'custom_days', { anchorDay: 1, intervalDays: 0 })).toThrow()
  })
})
