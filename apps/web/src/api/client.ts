import {
  type ChannelConfig,
  type CreateChannelConfigInput,
  type CreateSubscriptionInput,
  channelConfigSchema,
  type NotificationJob,
  notificationJobSchema,
  type Subscription,
  type SubscriptionStatus,
  subscriptionSchema,
  type UpdateSubscriptionInput,
  type UpdateUserInput,
  type User,
  userSchema,
  type WebPushTarget,
} from '@reminder/core'
import { z } from 'zod'
import { API_BASE_URL } from '../config.js'

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
}

function buildUrl(path: string, query?: CallOptions['query']): string {
  const url = new URL(path, API_BASE_URL)
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url.toString()
}

// Note: this is a plain fetch against the API's origin, not authClient.$fetch
// - better-auth scopes $fetch's baseURL to basePath ('/v1/auth'), so it can
// only reach auth endpoints, not the rest of the API.
async function request(path: string, options?: CallOptions): Promise<Response> {
  return fetch(buildUrl(path, options?.query), {
    method: options?.method ?? 'GET',
    credentials: 'include',
    headers: options?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
  })
}

async function errorMessage(res: Response, path: string): Promise<string> {
  const body = await res.json().catch(() => null)
  const custom = (body as { error?: unknown } | null)?.error
  return typeof custom === 'string' ? custom : `request to ${path} failed (${res.status})`
}

async function call<T>(path: string, schema: z.ZodType<T>, options?: CallOptions): Promise<T> {
  const res = await request(path, options)
  if (!res.ok) throw new ApiError(await errorMessage(res, path), res.status)
  return schema.parse(await res.json())
}

async function callVoid(path: string, options?: CallOptions): Promise<void> {
  const res = await request(path, options)
  if (!res.ok) throw new ApiError(await errorMessage(res, path), res.status)
}

export const api = {
  me: {
    get: (): Promise<User> => call('/v1/me', userSchema),
    update: (body: UpdateUserInput): Promise<User> =>
      call('/v1/me', userSchema, { method: 'PATCH', body }),
  },
  subscriptions: {
    list: (status?: SubscriptionStatus): Promise<Subscription[]> =>
      call('/v1/subscriptions', z.array(subscriptionSchema), { query: { status } }),
    get: (id: string): Promise<Subscription> => call(`/v1/subscriptions/${id}`, subscriptionSchema),
    create: (body: CreateSubscriptionInput): Promise<Subscription> =>
      call('/v1/subscriptions', subscriptionSchema, { method: 'POST', body }),
    update: (id: string, body: UpdateSubscriptionInput): Promise<Subscription> =>
      call(`/v1/subscriptions/${id}`, subscriptionSchema, { method: 'PATCH', body }),
    remove: (id: string): Promise<void> =>
      callVoid(`/v1/subscriptions/${id}`, { method: 'DELETE' }),
  },
  channels: {
    list: (): Promise<ChannelConfig[]> => call('/v1/channels', z.array(channelConfigSchema)),
    create: (body: CreateChannelConfigInput): Promise<ChannelConfig> =>
      call('/v1/channels', channelConfigSchema, { method: 'POST', body }),
    update: (
      id: string,
      body: { target?: Record<string, unknown>; enabled?: boolean },
    ): Promise<ChannelConfig> =>
      call(`/v1/channels/${id}`, channelConfigSchema, { method: 'PATCH', body }),
    remove: (id: string): Promise<void> => callVoid(`/v1/channels/${id}`, { method: 'DELETE' }),
    verify: async (id: string): Promise<{ ok: boolean; error?: string }> => {
      const res = await request(`/v1/channels/${id}/verify`, { method: 'POST' })
      if (!res.ok) return { ok: false, error: await errorMessage(res, `/v1/channels/${id}/verify`) }
      return { ok: true }
    },
  },
  reminders: {
    upcoming: (limit?: number): Promise<NotificationJob[]> =>
      call('/v1/reminders/upcoming', z.array(notificationJobSchema), { query: { limit } }),
  },
  devices: {
    register: (body: WebPushTarget): Promise<ChannelConfig> =>
      call('/v1/devices', channelConfigSchema, { method: 'POST', body }),
  },
}
