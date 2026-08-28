import { createChannelRegistry } from '@reminder/channels'
import { env } from './env.js'

export const channelRegistry = createChannelRegistry({
  resendApiKey: env.RESEND_API_KEY,
  resendFromEmail: env.RESEND_FROM_EMAIL,
  vapidPublicKey: env.VAPID_PUBLIC_KEY,
  vapidPrivateKey: env.VAPID_PRIVATE_KEY,
  vapidSubject: env.VAPID_SUBJECT,
})
