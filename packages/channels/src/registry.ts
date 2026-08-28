import type { ChannelType } from '@reminder/core'
import { createEmailChannel } from './email.js'
import type { NotificationChannel } from './types.js'
import { createWebPushChannel } from './webPush.js'

export interface ChannelRegistryOptions {
  resendApiKey: string
  resendFromEmail: string
  vapidPublicKey: string
  vapidPrivateKey: string
  vapidSubject: string
}

/**
 * Adding a channel (e.g. Telegram) later should mean a new file plus one
 * entry here — if it requires touching the worker or the domain package,
 * the abstraction is wrong.
 */
export function createChannelRegistry(
  options: ChannelRegistryOptions,
): Map<ChannelType, NotificationChannel> {
  const registry = new Map<ChannelType, NotificationChannel>()
  registry.set(
    'email',
    createEmailChannel({ apiKey: options.resendApiKey, fromEmail: options.resendFromEmail }),
  )
  registry.set(
    'push',
    createWebPushChannel({
      publicKey: options.vapidPublicKey,
      privateKey: options.vapidPrivateKey,
      subject: options.vapidSubject,
    }),
  )
  return registry
}
