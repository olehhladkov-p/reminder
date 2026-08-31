import type { schema } from '@reminder/db'

export function toUserDto(row: typeof schema.users.$inferSelect) {
  return {
    id: row.id,
    email: row.email,
    timezone: row.timezone,
    defaultLeadDays: row.defaultLeadDays,
    digestLocalTime: row.digestLocalTime.slice(0, 5),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function toSubscriptionDto(row: typeof schema.subscriptions.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    nextRenewalDate: row.nextRenewalDate,
    cycle: row.cycle,
    intervalDays: row.intervalDays,
    anchorDay: row.anchorDay,
    priceCents: row.priceCents,
    currency: row.currency,
    leadDays: row.leadDays,
    isTrial: row.isTrial,
    status: row.status,
    cancelUrl: row.cancelUrl,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export function toChannelDto(row: typeof schema.channelConfigs.$inferSelect) {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    target: row.target,
    enabled: row.enabled,
    verifiedAt: row.verifiedAt,
    createdAt: row.createdAt,
  }
}

export function toJobDto(row: typeof schema.notificationJobs.$inferSelect) {
  return {
    id: row.id,
    subscriptionId: row.subscriptionId,
    channelId: row.channelId,
    kind: row.kind,
    occurrenceDate: row.occurrenceDate,
    leadDays: row.leadDays,
    sendAt: row.sendAt,
    status: row.status,
    attempts: row.attempts,
    lastError: row.lastError,
    dedupeKey: row.dedupeKey,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}
