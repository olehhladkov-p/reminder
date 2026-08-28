import type { NotificationChannel } from '@reminder/channels'
import type { ChannelType } from '@reminder/core'
import type { Db } from '@reminder/db'
import type { Auth } from './auth.js'

export interface AppDeps {
  db: Db
  auth: Auth
  channelRegistry: Map<ChannelType, NotificationChannel>
}
