import { describe, expect, it } from 'vitest'
import { parseIsoDate } from './dates.js'
import {
  computeSendAt,
  dedupeKey,
  type MaterializeChannelInput,
  type MaterializeSubscriptionInput,
  type MaterializeUserInput,
  materializeJobs,
} from './scheduling.js'

describe('computeSendAt - DST boundaries (America/New_York, 2026)', () => {
  // DST starts Sun Mar 8 2026 (spring forward), ends Sun Nov 1 2026 (fall back).
  it('uses EST (UTC-5) just before the spring-forward transition', () => {
    const sendAt = computeSendAt(parseIsoDate('2026-03-07'), 0, '09:00', 'America/New_York')
    expect(sendAt.toISOString()).toBe('2026-03-07T14:00:00.000Z')
  })

  it('uses EDT (UTC-4) just after the spring-forward transition', () => {
    const sendAt = computeSendAt(parseIsoDate('2026-03-09'), 0, '09:00', 'America/New_York')
    expect(sendAt.toISOString()).toBe('2026-03-09T13:00:00.000Z')
  })

  it('uses EDT (UTC-4) just before the fall-back transition', () => {
    const sendAt = computeSendAt(parseIsoDate('2026-10-31'), 0, '09:00', 'America/New_York')
    expect(sendAt.toISOString()).toBe('2026-10-31T13:00:00.000Z')
  })

  it('uses EST (UTC-5) just after the fall-back transition', () => {
    const sendAt = computeSendAt(parseIsoDate('2026-11-02'), 0, '09:00', 'America/New_York')
    expect(sendAt.toISOString()).toBe('2026-11-02T14:00:00.000Z')
  })

  it('subtracts leadDays before converting to UTC', () => {
    const sendAt = computeSendAt(parseIsoDate('2026-03-10'), 3, '09:00', 'America/New_York')
    // 2026-03-07 is still EST (pre spring-forward)
    expect(sendAt.toISOString()).toBe('2026-03-07T14:00:00.000Z')
  })
})

const user: MaterializeUserInput = {
  timezone: 'UTC',
  digestLocalTime: '09:00',
  defaultLeadDays: [7, 1],
}

const channels: MaterializeChannelInput[] = [
  { id: 'chan-email', enabled: true },
  { id: 'chan-push', enabled: true },
  { id: 'chan-disabled', enabled: false },
]

function baseSubscription(
  overrides: Partial<MaterializeSubscriptionInput> = {},
): MaterializeSubscriptionInput {
  return {
    id: 'sub-1',
    status: 'active',
    nextRenewalDate: parseIsoDate('2026-01-15'),
    cycle: 'monthly',
    anchorDay: 15,
    leadDays: [7, 3],
    ...overrides,
  }
}

describe('materializeJobs', () => {
  const now = new Date('2025-12-01T00:00:00.000Z')

  it('generates jobs for the next N renewal occurrences x leadDays x enabled channels only', () => {
    const drafts = materializeJobs(baseSubscription(), user, channels, { now })

    // 2 occurrences x 2 leadDays x 2 enabled channels = 8
    expect(drafts).toHaveLength(8)
    expect(drafts.every((d) => d.channelId !== 'chan-disabled')).toBe(true)
    expect(new Set(drafts.map((d) => d.occurrenceDate))).toEqual(
      new Set(['2026-01-15', '2026-02-15']),
    )
    expect(drafts.every((d) => d.kind === 'renewal')).toBe(true)
  })

  it('produces unique dedupe keys for every job', () => {
    const drafts = materializeJobs(baseSubscription(), user, channels, { now })
    const keys = new Set(drafts.map((d) => d.dedupeKey))
    expect(keys.size).toBe(drafts.length)
  })

  it('falls back to the user default lead days when the subscription has none', () => {
    const drafts = materializeJobs(baseSubscription({ leadDays: null }), user, channels, { now })
    const leadDaysUsed = new Set(drafts.map((d) => d.leadDays))
    expect(leadDaysUsed).toEqual(new Set(user.defaultLeadDays))
  })

  it('skips paused and cancelled subscriptions', () => {
    expect(
      materializeJobs(baseSubscription({ status: 'paused' }), user, channels, { now }),
    ).toEqual([])
    expect(
      materializeJobs(baseSubscription({ status: 'cancelled' }), user, channels, { now }),
    ).toEqual([])
  })

  it('adds a one-shot trial_end job that does not roll forward', () => {
    const drafts = materializeJobs(
      baseSubscription({ trialEndsAt: parseIsoDate('2025-12-20') }),
      user,
      channels,
      { now },
    )
    const trialJobs = drafts.filter((d) => d.kind === 'trial_end')
    // 2 leadDays (inherited) x 2 enabled channels, one occurrence only
    expect(trialJobs).toHaveLength(4)
    expect(new Set(trialJobs.map((d) => d.occurrenceDate))).toEqual(new Set(['2025-12-20']))
  })

  it('trial_end uses trialLeadDays when set, independent of renewal leadDays', () => {
    const drafts = materializeJobs(
      baseSubscription({
        trialEndsAt: parseIsoDate('2025-12-20'),
        trialLeadDays: [1],
      }),
      user,
      channels,
      { now },
    )
    const trialJobs = drafts.filter((d) => d.kind === 'trial_end')
    expect(trialJobs.map((d) => d.leadDays)).toEqual([1, 1]) // one per enabled channel
  })

  it('clamps a slightly-past send_at to now + 1 minute instead of dropping it', () => {
    const nowJustAfter = new Date('2026-01-08T09:00:01.000Z') // 1s after the 7-day-lead job's send_at
    const drafts = materializeJobs(baseSubscription({ leadDays: [7] }), user, channels, {
      now: nowJustAfter,
    })
    const job = drafts.find((d) => d.occurrenceDate === '2026-01-15')
    expect(job).toBeDefined()
    // biome-ignore lint/style/noNonNullAssertion: just asserted defined above
    expect(job!.sendAt.getTime()).toBe(nowJustAfter.getTime() + 60_000)
  })

  it('drops a send_at that is more than a day in the past instead of clamping it', () => {
    const nowMuchLater = new Date('2026-01-20T00:00:00.000Z')
    const drafts = materializeJobs(baseSubscription({ leadDays: [7] }), user, channels, {
      now: nowMuchLater,
    })
    // the 2026-01-15 occurrence's 7-day-lead job would have sent 2026-01-08, long past -> dropped
    const droppedOccurrenceJobs = drafts.filter((d) => d.occurrenceDate === '2026-01-15')
    expect(droppedOccurrenceJobs).toHaveLength(0)
  })

  it('renew: rolling next_renewal_date forward drops the old occurrence and extends the horizon', () => {
    const before = materializeJobs(baseSubscription(), user, channels, { now })
    expect(new Set(before.map((d) => d.occurrenceDate))).toEqual(
      new Set(['2026-01-15', '2026-02-15']),
    )

    // Simulates the post-advance() state: next_renewal_date rolled forward one cycle.
    const rolled = baseSubscription({ nextRenewalDate: parseIsoDate('2026-02-15') })
    const after = materializeJobs(rolled, user, channels, { now })
    expect(new Set(after.map((d) => d.occurrenceDate))).toEqual(
      new Set(['2026-02-15', '2026-03-15']),
    )

    // The occurrence that carries over (old horizon's 2nd -> new horizon's 1st) must
    // produce identical dedupe keys, so "delete pending + re-materialize" on renew
    // never double-books a job that was already sitting in the future.
    const keysFor = (drafts: typeof before, occurrenceDate: string) =>
      drafts
        .filter((d) => d.occurrenceDate === occurrenceDate)
        .map((d) => d.dedupeKey)
        .sort()
    expect(keysFor(after, '2026-02-15')).toEqual(keysFor(before, '2026-02-15'))
  })
})

describe('dedupeKey', () => {
  it('is stable and matches the documented format', () => {
    expect(dedupeKey('sub-1', 'renewal', '2026-01-15', 7, 'chan-1')).toBe(
      'sub-1:renewal:2026-01-15:7:chan-1',
    )
  })
})
