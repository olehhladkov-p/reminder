import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, signIn, type TestApp } from '../test/testApp.js'

describe('me route', () => {
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

  it('requires auth', async () => {
    expect((await testApp.app.request('/v1/me')).status).toBe(401)
  })

  it('returns the signed-in user with app defaults', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const res = await testApp.app.request('/v1/me', { headers: { cookie } })
    const body = (await res.json()) as any
    expect(body.email).toBe('a@example.com')
    expect(body.timezone).toBe('UTC')
    expect(body.digestLocalTime).toBe('09:00')
    expect(body.defaultLeadDays).toEqual([7, 3, 1])
  })

  it('normalizes defaultLeadDays on PATCH and re-materializes existing subscriptions', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    await testApp.app.request('/v1/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Sub', nextRenewalDate: '2027-06-15' }), // no per-sub leadDays -> uses user default
    })
    await testApp.app.request('/v1/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ type: 'email', target: { email: 'a@example.com' } }),
    })
    const before = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(new Set(before.map((j: { leadDays: number }) => j.leadDays))).toEqual(new Set([7, 3, 1]))

    const patchRes = await testApp.app.request('/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ defaultLeadDays: [14, 1, 14] }),
    })
    const patched = (await patchRes.json()) as any
    expect(patched.defaultLeadDays).toEqual([14, 1])

    const after = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(new Set(after.map((j: { leadDays: number }) => j.leadDays))).toEqual(new Set([14, 1]))
  })

  it('re-materializes when timezone or digest time changes', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    await testApp.app.request('/v1/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ name: 'Sub', nextRenewalDate: '2027-06-15', leadDays: [7] }),
    })
    await testApp.app.request('/v1/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ type: 'email', target: { email: 'a@example.com' } }),
    })
    const before = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any

    await testApp.app.request('/v1/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ timezone: 'America/New_York', digestLocalTime: '20:00' }),
    })

    const after = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    // Same jobs (dedupe keys stay put), but a different wall-clock digest time
    // in a different timezone means a different UTC sendAt.
    expect(after[0].sendAt).not.toBe(before[0].sendAt)
  })
})
