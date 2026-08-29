import { type EmailTarget, emailTargetSchema } from '@reminder/core'
import { Resend } from 'resend'
import { renderEmailLayout } from './emailLayout.js'
import type { DeliveryResult, NotificationChannel, ReminderPayload, Result } from './types.js'

export interface EmailChannelOptions {
  apiKey: string
  fromEmail: string
}

export function createEmailChannel(options: EmailChannelOptions): NotificationChannel<EmailTarget> {
  const resend = new Resend(options.apiKey)

  return {
    type: 'email',

    validateTarget(target: unknown): Result<EmailTarget> {
      const parsed = emailTargetSchema.safeParse(target)
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, error: parsed.error.message }
    },

    async send(payload: ReminderPayload, target: EmailTarget): Promise<DeliveryResult> {
      const { data, error } = await resend.emails.send(
        {
          from: `Subscription Reminder <${options.fromEmail}>`,
          to: target.email,
          subject: renderSubject(payload),
          html: renderHtml(payload),
        },
        payload.idempotencyKey ? { idempotencyKey: payload.idempotencyKey } : undefined,
      )
      if (error) return { ok: false, error: error.message }
      return { ok: true, providerMessageId: data?.id }
    },

    async sendDigest(payloads: ReminderPayload[], target: EmailTarget): Promise<DeliveryResult> {
      const { data, error } = await resend.emails.send(
        {
          from: `Subscription Reminder <${options.fromEmail}>`,
          to: target.email,
          subject: renderDigestSubject(payloads),
          html: renderDigestHtml(payloads),
        },
        payloads[0]?.idempotencyKey ? { idempotencyKey: payloads[0].idempotencyKey } : undefined,
      )
      if (error) return { ok: false, error: error.message }
      return { ok: true, providerMessageId: data?.id }
    },
  }
}

function renderSubject(payload: ReminderPayload): string {
  const days = pluralDays(payload.daysUntil)
  return payload.kind === 'trial_end'
    ? `Your ${payload.subscriptionName} trial ends ${days}`
    : `${payload.subscriptionName} renews ${days}`
}

function renderHtml(payload: ReminderPayload): string {
  const eventLabel = payload.kind === 'trial_end' ? 'trial ends' : 'renews'
  const priceLine = payload.priceDisplay ? ` for <strong>${payload.priceDisplay}</strong>` : ''
  const cancelLine = payload.cancelUrl
    ? `<p style="margin: 16px 0 0;"><a href="${payload.cancelUrl}" style="color: #6b7280;">Cancel this subscription</a></p>`
    : ''

  return renderEmailLayout({
    preheader: `${payload.subscriptionName} ${eventLabel} ${pluralDays(payload.daysUntil)}`,
    heading: renderSubject(payload),
    bodyHtml: `<p style="margin: 0;">${
      payload.kind === 'trial_end' ? 'Your trial' : 'Your subscription'
    } to <strong>${payload.subscriptionName}</strong> ${eventLabel}${priceLine} on ${formatFriendlyDate(payload.renewalDate)}.</p>${cancelLine}`,
    cta: { label: 'View subscription', url: payload.deepLink },
    footerNote: "You're receiving this because you set up a reminder for this subscription.",
  })
}

function renderDigestSubject(payloads: ReminderPayload[]): string {
  const [first] = payloads
  if (!first) return 'Your subscription reminders'
  if (payloads.length === 1) return renderSubject(first)
  return `${payloads.length} subscription reminders`
}

function renderDigestHtml(payloads: ReminderPayload[]): string {
  const items = payloads
    .map((payload) => {
      const eventLabel = payload.kind === 'trial_end' ? 'trial ends' : 'renews'
      const priceLine = payload.priceDisplay ? ` for <strong>${payload.priceDisplay}</strong>` : ''
      const cancelLine = payload.cancelUrl
        ? ` &middot; <a href="${payload.cancelUrl}" style="color: #6b7280;">Cancel</a>`
        : ''
      return `<li style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
        <p style="margin: 0;"><strong>${payload.subscriptionName}</strong> ${eventLabel}${priceLine} on ${formatFriendlyDate(payload.renewalDate)}.</p>
        <p style="margin: 4px 0 0; font-size: 13px;"><a href="${payload.deepLink}" style="color: #6b7280;">View subscription</a>${cancelLine}</p>
      </li>`
    })
    .join('')

  return renderEmailLayout({
    preheader: `${payloads.length} subscription reminders`,
    heading: renderDigestSubject(payloads),
    bodyHtml: `<ul style="margin: 0; padding: 0; list-style: none;">${items}</ul>`,
    footerNote: "You're receiving this because you set up reminders for these subscriptions.",
  })
}

function formatFriendlyDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`)
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function pluralDays(daysUntil: number): string {
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  return `in ${daysUntil} days`
}
