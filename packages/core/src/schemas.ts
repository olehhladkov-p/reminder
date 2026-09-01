import { z } from 'zod'

export const cycleSchema = z.enum(['weekly', 'monthly', 'quarterly', 'yearly', 'custom_days'])
export const channelTypeSchema = z.enum(['email', 'push', 'telegram', 'webhook'])
export const jobKindSchema = z.enum(['renewal', 'trial_end'])
export const jobStatusSchema = z.enum(['pending', 'processing', 'sent', 'failed', 'cancelled'])
export const subscriptionStatusSchema = z.enum(['active', 'paused', 'cancelled'])
export const colorModeSchema = z.enum(['light', 'dark', 'system'])

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:mm')
export const ianaTimezoneSchema = z.string().min(1)

// Business rule (dedupe/sort/cap) is applied by normalizeLeadDays() at write time,
// not here — this only validates shape.
export const leadDaysSchema = z.array(z.number().int().min(0).max(3650)).max(10)

// Not validated against the real theme list (that lives in apps/web/src/themes.json,
// a different package) - mirrors ianaTimezoneSchema's approach of trusting the client.
export const themeNameSchema = z.string().min(1).max(100)

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  timezone: ianaTimezoneSchema,
  defaultLeadDays: leadDaysSchema,
  digestLocalTime: localTimeSchema,
  theme: themeNameSchema,
  colorMode: colorModeSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const updateUserSchema = z.object({
  timezone: ianaTimezoneSchema.optional(),
  defaultLeadDays: leadDaysSchema.optional(),
  digestLocalTime: localTimeSchema.optional(),
  theme: themeNameSchema.optional(),
  colorMode: colorModeSchema.optional(),
})

const baseSubscriptionFields = {
  name: z.string().min(1).max(200),
  nextRenewalDate: isoDateSchema,
  priceCents: z.number().int().min(0).nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  leadDays: leadDaysSchema.nullable().optional(),
  // A trial uses the subscription's renewal date and reminder settings for a
  // one-time trial-end notification instead of a renewal notification.
  isTrial: z.boolean().optional(),
  cancelUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
}

export const createSubscriptionSchema = z
  .object({
    ...baseSubscriptionFields,
    cycle: cycleSchema.default('monthly'),
    intervalDays: z.number().int().min(1).nullable().optional(),
  })
  .refine((v) => v.cycle !== 'custom_days' || (v.intervalDays ?? 0) > 0, {
    message: 'intervalDays is required when cycle is custom_days',
    path: ['intervalDays'],
  })

export const updateSubscriptionSchema = z
  .object({
    ...baseSubscriptionFields,
    cycle: cycleSchema.optional(),
    intervalDays: z.number().int().min(1).nullable().optional(),
    status: subscriptionStatusSchema.optional(),
  })
  .partial()

export const subscriptionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  name: z.string(),
  nextRenewalDate: isoDateSchema,
  cycle: cycleSchema,
  intervalDays: z.number().int().nullable(),
  anchorDay: z.number().int().min(1).max(31),
  priceCents: z.number().int().nullable(),
  currency: z.string().nullable(),
  leadDays: leadDaysSchema.nullable(),
  isTrial: z.boolean(),
  status: subscriptionStatusSchema,
  cancelUrl: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const emailTargetSchema = z.object({ email: z.string().email() })
export const pushPlatformSchema = z.enum(['desktop', 'mobile'])
export const webPushTargetSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  // Client-detected at subscribe time from the user agent - best-effort, used
  // only to label the channel in the UI. Absent on subscriptions registered
  // before this field existed.
  platform: pushPlatformSchema.optional(),
})

export const channelConfigSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  type: channelTypeSchema,
  target: z.record(z.unknown()),
  enabled: z.boolean(),
  verifiedAt: z.coerce.date().nullable(),
  createdAt: z.coerce.date(),
})

export const createChannelConfigSchema = z.object({
  type: channelTypeSchema,
  target: z.record(z.unknown()),
  enabled: z.boolean().default(true),
})

export const notificationJobSchema = z.object({
  id: z.string().uuid(),
  subscriptionId: z.string().uuid(),
  channelId: z.string().uuid(),
  kind: jobKindSchema,
  occurrenceDate: isoDateSchema,
  leadDays: z.number().int().min(0),
  sendAt: z.coerce.date(),
  status: jobStatusSchema,
  attempts: z.number().int().min(0),
  lastError: z.string().nullable(),
  dedupeKey: z.string(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export type EmailTarget = z.infer<typeof emailTargetSchema>
export type PushPlatform = z.infer<typeof pushPlatformSchema>
export type WebPushTarget = z.infer<typeof webPushTargetSchema>

export type Cycle = z.infer<typeof cycleSchema>
export type ChannelType = z.infer<typeof channelTypeSchema>
export type JobKind = z.infer<typeof jobKindSchema>
export type JobStatus = z.infer<typeof jobStatusSchema>
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>
export type ColorMode = z.infer<typeof colorModeSchema>
export type User = z.infer<typeof userSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type Subscription = z.infer<typeof subscriptionSchema>
export type CreateSubscriptionInput = z.infer<typeof createSubscriptionSchema>
export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>
export type ChannelConfig = z.infer<typeof channelConfigSchema>
export type CreateChannelConfigInput = z.infer<typeof createChannelConfigSchema>
export type NotificationJob = z.infer<typeof notificationJobSchema>
