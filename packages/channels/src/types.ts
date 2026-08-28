import type { ChannelType, JobKind } from '@reminder/core'

/** Rendered content for a reminder — never raw entities, so channel adapters stay decoupled from the domain. */
export interface ReminderPayload {
  subscriptionName: string
  renewalDate: string
  daysUntil: number
  kind: JobKind
  priceDisplay?: string
  cancelUrl?: string
  deepLink: string
  /**
   * Passed through as a provider idempotency key when the channel supports
   * one (currently: email via Resend's `Idempotency-Key` header). Lets a
   * caller safely re-send after a crash of unknown outcome without risking
   * a duplicate delivery.
   */
  idempotencyKey?: string
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: string }

export interface DeliveryResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

export interface NotificationChannel<Target = unknown> {
  type: ChannelType
  validateTarget(target: unknown): Result<Target>
  send(payload: ReminderPayload, target: Target): Promise<DeliveryResult>
}
