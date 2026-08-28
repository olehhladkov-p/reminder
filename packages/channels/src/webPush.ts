import { type WebPushTarget, webPushTargetSchema } from '@reminder/core'
import webpush from 'web-push'
import type { DeliveryResult, NotificationChannel, ReminderPayload, Result } from './types.js'

export interface WebPushChannelOptions {
  publicKey: string
  privateKey: string
  /** VAPID contact per RFC 8292 - a `mailto:` address or an `https:` URL. */
  subject: string
}

export function createWebPushChannel(
  options: WebPushChannelOptions,
): NotificationChannel<WebPushTarget> {
  webpush.setVapidDetails(options.subject, options.publicKey, options.privateKey)

  return {
    type: 'push',

    validateTarget(target: unknown): Result<WebPushTarget> {
      const parsed = webPushTargetSchema.safeParse(target)
      return parsed.success
        ? { ok: true, value: parsed.data }
        : { ok: false, error: parsed.error.message }
    },

    async send(payload: ReminderPayload, target: WebPushTarget): Promise<DeliveryResult> {
      try {
        await webpush.sendNotification(
          { endpoint: target.endpoint, keys: target.keys },
          JSON.stringify({
            title: renderTitle(payload),
            body: renderBody(payload),
            url: payload.deepLink,
          }),
        )
        return { ok: true }
      } catch (err) {
        // web-push throws a WebPushError with a `statusCode`; a 404/410 means
        // the browser dropped the subscription (uninstalled, cleared data) -
        // surfaced the same as any other failure, the caller decides whether
        // that's worth disabling the channel.
        return { ok: false, error: err instanceof Error ? err.message : 'web push send failed' }
      }
    },
  }
}

function renderTitle(payload: ReminderPayload): string {
  return payload.kind === 'trial_end'
    ? `${payload.subscriptionName} trial ending`
    : `${payload.subscriptionName} renewing soon`
}

function renderBody(payload: ReminderPayload): string {
  const when =
    payload.daysUntil === 0
      ? 'today'
      : payload.daysUntil === 1
        ? 'tomorrow'
        : `in ${payload.daysUntil} days`
  return payload.priceDisplay ? `${when} — ${payload.priceDisplay}` : when
}
