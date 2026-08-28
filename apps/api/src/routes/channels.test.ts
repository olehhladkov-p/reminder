import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, signIn, type TestApp } from '../test/testApp.js'

describe('channels routes', () => {
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

  async function post(path: string, cookie: string, body?: unknown) {
    return testApp.app.request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  it('requires auth', async () => {
    expect((await testApp.app.request('/v1/channels')).status).toBe(401)
  })

  it('rejects a target that fails the channel adapter validation', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const res = await post('/v1/channels', cookie, {
      type: 'email',
      target: { email: 'not-an-email' },
    })
    expect(res.status).toBe(400)
  })

  it('rejects an unsupported channel type', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const res = await post('/v1/channels', cookie, {
      type: 'telegram',
      target: { chatId: '123' },
    })
    expect(res.status).toBe(400)
  })

  it('creates a channel and re-materializes jobs for existing active subscriptions', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    await post('/v1/subscriptions', cookie, {
      name: 'Sub',
      nextRenewalDate: '2027-06-15',
      leadDays: [7],
    })
    expect(
      (
        (await (
          await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
        ).json()) as any
      ).length,
    ).toBe(0)

    const res = await post('/v1/channels', cookie, {
      type: 'email',
      target: { email: 'a@example.com' },
    })
    expect(res.status).toBe(201)

    const rows = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(rows.length).toBeGreaterThan(0)
  })

  it("404s when another user acts on someone else's channel", async () => {
    const cookieA = await signIn(testApp, 'a@example.com')
    const cookieB = await signIn(testApp, 'b@example.com')
    const channel = (await (
      await post('/v1/channels', cookieA, { type: 'email', target: { email: 'a@example.com' } })
    ).json()) as any

    expect(
      (
        await testApp.app.request(`/v1/channels/${channel.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', cookie: cookieB },
          body: JSON.stringify({ enabled: false }),
        })
      ).status,
    ).toBe(404)

    expect(
      (
        await testApp.app.request(`/v1/channels/${channel.id}`, {
          method: 'DELETE',
          headers: { cookie: cookieB },
        })
      ).status,
    ).toBe(404)

    expect((await post(`/v1/channels/${channel.id}/verify`, cookieB)).status).toBe(404)
  })

  it('verify sends through the channel adapter and stamps verifiedAt', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const channel = (await (
      await post('/v1/channels', cookie, { type: 'email', target: { email: 'a@example.com' } })
    ).json()) as any
    expect(channel.verifiedAt).toBeNull()

    const res = await post(`/v1/channels/${channel.id}/verify`, cookie)
    expect(res.status).toBe(200)
    expect((await res.json()) as any).toEqual({ ok: true })

    const fakeEmailChannel = testApp.channelRegistry.get('email')
    expect(fakeEmailChannel?.sent).toHaveLength(1)
    expect(fakeEmailChannel?.sent[0]?.target).toEqual({ email: 'a@example.com' })

    const listed = (await (
      await testApp.app.request('/v1/channels', { headers: { cookie } })
    ).json()) as any
    expect(listed[0].verifiedAt).not.toBeNull()
  })

  it('clears verifiedAt when the target changes', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const channel = (await (
      await post('/v1/channels', cookie, { type: 'email', target: { email: 'a@example.com' } })
    ).json()) as any
    await post(`/v1/channels/${channel.id}/verify`, cookie)

    const res = await testApp.app.request(`/v1/channels/${channel.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ target: { email: 'new@example.com' } }),
    })
    const body = (await res.json()) as any
    expect(body.verifiedAt).toBeNull()
    expect(body.target).toEqual({ email: 'new@example.com' })
  })

  it('delete cascades notification_jobs and re-materializes remaining channels', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    await post('/v1/subscriptions', cookie, {
      name: 'Sub',
      nextRenewalDate: '2027-06-15',
      leadDays: [7],
    })
    const channel = (await (
      await post('/v1/channels', cookie, { type: 'email', target: { email: 'a@example.com' } })
    ).json()) as any
    expect(
      (
        (await (
          await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
        ).json()) as any
      ).length,
    ).toBeGreaterThan(0)

    const deleteRes = await testApp.app.request(`/v1/channels/${channel.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(deleteRes.status).toBe(204)

    const rows = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(rows).toHaveLength(0)
  })
})
