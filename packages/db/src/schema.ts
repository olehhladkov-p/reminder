import { relations, sql } from 'drizzle-orm'
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core'

export const cycleEnum = pgEnum('cycle', [
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
  'custom_days',
])
export const channelTypeEnum = pgEnum('channel_type', ['email', 'push', 'telegram', 'webhook'])
export const jobKindEnum = pgEnum('job_kind', ['renewal', 'trial_end'])
export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'processing',
  'sent',
  'failed',
  'cancelled',
])
export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'paused',
  'cancelled',
])

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  timezone: text('timezone').notNull(),
  defaultLeadDays: integer('default_lead_days').array().notNull().default(sql`ARRAY[]::integer[]`),
  digestLocalTime: time('digest_local_time').notNull().default('09:00:00'),
  ...timestamps,
})

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nextRenewalDate: date('next_renewal_date').notNull(),
    cycle: cycleEnum('cycle').notNull().default('monthly'),
    intervalDays: integer('interval_days'),
    // Day-of-month the subscription is anchored to; used to clamp
    // month-based cycles (see @reminder/core advance()).
    anchorDay: integer('anchor_day').notNull(),
    priceCents: integer('price_cents'),
    currency: text('currency'),
    leadDays: integer('lead_days').array(),
    isTrial: boolean('is_trial').notNull().default(false),
    status: subscriptionStatusEnum('status').notNull().default('active'),
    cancelUrl: text('cancel_url'),
    notes: text('notes'),
    ...timestamps,
  },
  (table) => [
    index('subscriptions_user_id_next_renewal_date_idx').on(table.userId, table.nextRenewalDate),
  ],
)

export const channelConfigs = pgTable('channel_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: channelTypeEnum('type').notNull(),
  target: jsonb('target').notNull().$type<Record<string, unknown>>(),
  enabled: boolean('enabled').notNull().default(true),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const notificationJobs = pgTable(
  'notification_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    channelId: uuid('channel_id')
      .notNull()
      .references(() => channelConfigs.id, { onDelete: 'cascade' }),
    kind: jobKindEnum('kind').notNull(),
    occurrenceDate: date('occurrence_date').notNull(),
    leadDays: integer('lead_days').notNull(),
    sendAt: timestamp('send_at', { withTimezone: true }).notNull(),
    status: jobStatusEnum('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
    // The correctness guarantee: re-materialization inserts with
    // ON CONFLICT (dedupe_key) DO NOTHING, so overlapping regeneration
    // (edits, renew, nightly horizon extension) is always safe.
    dedupeKey: text('dedupe_key').notNull(),
    ...timestamps,
  },
  (table) => [
    index('notification_jobs_status_send_at_idx').on(table.status, table.sendAt),
    unique('notification_jobs_dedupe_key_key').on(table.dedupeKey),
  ],
)

export const deliveries = pgTable('deliveries', {
  id: uuid('id').primaryKey().defaultRandom(),
  jobId: uuid('job_id')
    .notNull()
    .references(() => notificationJobs.id, { onDelete: 'cascade' }),
  channelType: channelTypeEnum('channel_type').notNull(),
  providerMessageId: text('provider_message_id'),
  status: text('status').notNull(),
  error: text('error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
})

export const usersRelations = relations(users, ({ many }) => ({
  subscriptions: many(subscriptions),
  channelConfigs: many(channelConfigs),
}))

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, { fields: [subscriptions.userId], references: [users.id] }),
  notificationJobs: many(notificationJobs),
}))

export const channelConfigsRelations = relations(channelConfigs, ({ one, many }) => ({
  user: one(users, { fields: [channelConfigs.userId], references: [users.id] }),
  notificationJobs: many(notificationJobs),
}))

export const notificationJobsRelations = relations(notificationJobs, ({ one, many }) => ({
  subscription: one(subscriptions, {
    fields: [notificationJobs.subscriptionId],
    references: [subscriptions.id],
  }),
  channel: one(channelConfigs, {
    fields: [notificationJobs.channelId],
    references: [channelConfigs.id],
  }),
  deliveries: many(deliveries),
}))

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  job: one(notificationJobs, { fields: [deliveries.jobId], references: [notificationJobs.id] }),
}))
