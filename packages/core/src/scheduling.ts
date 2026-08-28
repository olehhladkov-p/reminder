import { fromZonedTime } from 'date-fns-tz'
import { addDaysPlain, formatIsoDate, type PlainDate } from './dates.js'
import { normalizeLeadDays } from './leadDays.js'
import { advance } from './recurrence.js'
import type { Cycle } from './schemas.js'

/**
 * Converts "N days before this calendar date, at the user's digest time"
 * into a UTC instant. Never hand-rolls offset math — delegates the
 * IANA-timezone-aware local-to-UTC conversion to date-fns-tz.
 */
export function computeSendAt(
  occurrenceDate: PlainDate,
  leadDays: number,
  digestLocalTime: string,
  timezone: string,
): Date {
  const sendDate = addDaysPlain(occurrenceDate, -leadDays)
  const match = /^(\d{2}):(\d{2})$/.exec(digestLocalTime)
  if (!match) throw new Error(`computeSendAt: invalid digestLocalTime ${digestLocalTime}`)
  const localIso = `${formatIsoDate(sendDate)}T${match[1]}:${match[2]}:00`
  return fromZonedTime(localIso, timezone)
}

export interface MaterializeSubscriptionInput {
  id: string
  status: 'active' | 'paused' | 'cancelled'
  nextRenewalDate: PlainDate
  cycle: Cycle
  intervalDays?: number | null
  anchorDay: number
  leadDays?: readonly number[] | null
  trialEndsAt?: PlainDate | null
  trialLeadDays?: readonly number[] | null
}

export interface MaterializeUserInput {
  timezone: string
  digestLocalTime: string
  defaultLeadDays: readonly number[]
}

export interface MaterializeChannelInput {
  id: string
  enabled: boolean
}

export interface JobDraft {
  subscriptionId: string
  channelId: string
  kind: 'renewal' | 'trial_end'
  occurrenceDate: string
  leadDays: number
  sendAt: Date
  dedupeKey: string
}

export interface MaterializeOptions {
  /** Instant materialization runs at; used for the past-job clamp/drop rule. */
  now: Date
  /** Number of future renewal occurrences to materialize jobs for. */
  occurrenceHorizon?: number
  /** A computed send_at further in the past than this is dropped, not clamped. */
  pastDropThresholdMs?: number
  /** A computed send_at in the past but within the drop threshold is clamped to now + this. */
  pastClampMs?: number
}

const DEFAULT_HORIZON = 2
const DEFAULT_PAST_DROP_THRESHOLD_MS = 24 * 60 * 60 * 1000
const DEFAULT_PAST_CLAMP_MS = 60_000

export function dedupeKey(
  subscriptionId: string,
  kind: 'renewal' | 'trial_end',
  occurrenceDate: string,
  leadDays: number,
  channelId: string,
): string {
  return `${subscriptionId}:${kind}:${occurrenceDate}:${leadDays}:${channelId}`
}

/**
 * Pure computation of "what pending jobs should exist right now" for one
 * subscription. Callers persist the result with `ON CONFLICT (dedupe_key)
 * DO NOTHING` — this function has no knowledge of what's already in the DB,
 * so overlapping/repeated calls are always safe to upsert from.
 */
export function materializeJobs(
  subscription: MaterializeSubscriptionInput,
  user: MaterializeUserInput,
  channels: readonly MaterializeChannelInput[],
  options: MaterializeOptions,
): JobDraft[] {
  if (subscription.status !== 'active') return []

  const enabledChannels = channels.filter((c) => c.enabled)
  if (enabledChannels.length === 0) return []

  const horizon = options.occurrenceHorizon ?? DEFAULT_HORIZON
  const pastDropThresholdMs = options.pastDropThresholdMs ?? DEFAULT_PAST_DROP_THRESHOLD_MS
  const pastClampMs = options.pastClampMs ?? DEFAULT_PAST_CLAMP_MS

  const drafts: JobDraft[] = []

  const renewalLeadDays = normalizeLeadDays(subscription.leadDays ?? user.defaultLeadDays)
  let occurrence = subscription.nextRenewalDate
  for (let i = 0; i < horizon; i++) {
    pushJobsForOccurrence(
      drafts,
      subscription,
      user,
      enabledChannels,
      'renewal',
      occurrence,
      renewalLeadDays,
      options.now,
      pastDropThresholdMs,
      pastClampMs,
    )
    occurrence = advance(occurrence, subscription.cycle, {
      anchorDay: subscription.anchorDay,
      intervalDays: subscription.intervalDays,
    })
  }

  if (subscription.trialEndsAt) {
    const trialLeadDays = normalizeLeadDays(
      subscription.trialLeadDays ?? subscription.leadDays ?? user.defaultLeadDays,
    )
    pushJobsForOccurrence(
      drafts,
      subscription,
      user,
      enabledChannels,
      'trial_end',
      subscription.trialEndsAt,
      trialLeadDays,
      options.now,
      pastDropThresholdMs,
      pastClampMs,
    )
  }

  return drafts
}

function pushJobsForOccurrence(
  drafts: JobDraft[],
  subscription: MaterializeSubscriptionInput,
  user: MaterializeUserInput,
  enabledChannels: readonly MaterializeChannelInput[],
  kind: 'renewal' | 'trial_end',
  occurrenceDate: PlainDate,
  leadDaysList: readonly number[],
  now: Date,
  pastDropThresholdMs: number,
  pastClampMs: number,
): void {
  const occurrenceIso = formatIsoDate(occurrenceDate)
  for (const leadDays of leadDaysList) {
    const rawSendAt = computeSendAt(occurrenceDate, leadDays, user.digestLocalTime, user.timezone)
    const sendAt = clampOrNull(rawSendAt, now, pastDropThresholdMs, pastClampMs)
    if (sendAt === null) continue

    for (const channel of enabledChannels) {
      drafts.push({
        subscriptionId: subscription.id,
        channelId: channel.id,
        kind,
        occurrenceDate: occurrenceIso,
        leadDays,
        sendAt,
        dedupeKey: dedupeKey(subscription.id, kind, occurrenceIso, leadDays, channel.id),
      })
    }
  }
}

function clampOrNull(
  sendAt: Date,
  now: Date,
  pastDropThresholdMs: number,
  pastClampMs: number,
): Date | null {
  const deltaMs = now.getTime() - sendAt.getTime()
  if (deltaMs <= 0) return sendAt
  if (deltaMs > pastDropThresholdMs) return null
  return new Date(now.getTime() + pastClampMs)
}
