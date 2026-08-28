import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, signIn, type TestApp } from '../test/testApp.js'

const subscription = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-secret' },
})

describe('devices route', () => {
  let testApp: TestApp

  beforeAll(async () => {
    testApp = await createTestApp()
  })

  beforeEach(async () => {
    await testApp.reset()
  })

  afterAll(async () => {
    await testApp.close()
  })

  async function registerDevice(cookie: string, body: unknown) {
    return testApp.app.request('/v1/devices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify(body),
    })
  }

  it('requires auth', async () => {
    expect(
      (
        await testApp.app.request('/v1/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(subscription('https://push.example.com/a')),
        })
      ).status,
    ).toBe(401)
  })

  it('rejects a malformed push subscription', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const res = await registerDevice(cookie, { endpoint: 'not-a-url' })
    expect(res.status).toBe(400)
  })

  it('registers a new push subscription as a push channel_config', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const res = await registerDevice(cookie, subscription('https://push.example.com/a'))
    expect(res.status).toBe(201)
    const body = (await res.json()) as any
    expect(body.type).toBe('push')
    expect(body.enabled).toBe(true)

    const listed = (await (
      await testApp.app.request('/v1/channels', { headers: { cookie } })
    ).json()) as any
    expect(listed).toHaveLength(1)
  })

  it('registering the same endpoint again refreshes it instead of duplicating', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const endpoint = 'https://push.example.com/a'
    const first = await registerDevice(cookie, subscription(endpoint))
    expect(first.status).toBe(201)

    const second = await registerDevice(cookie, {
      endpoint,
      keys: { p256dh: 'rotated-key', auth: 'rotated-secret' },
    })
    expect(second.status).toBe(200)

    const listed = (await (
      await testApp.app.request('/v1/channels', { headers: { cookie } })
    ).json()) as any
    expect(listed).toHaveLength(1)
    expect(listed[0].target.keys.p256dh).toBe('rotated-key')
  })
})
