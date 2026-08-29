import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, signIn, type TestApp } from '../test/testApp.js'

describe('subscriptions routes', () => {
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
    expect((await testApp.app.request('/v1/subscriptions')).status).toBe(401)
  })

  it('creates a subscription, deriving anchorDay from nextRenewalDate and normalizing leadDays', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const res = await post('/v1/subscriptions', cookie, {
      name: 'Netflix',
      nextRenewalDate: '2026-01-31',
      leadDays: [3, 7, 3, 1],
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as any
    expect(body.anchorDay).toBe(31)
    expect(body.leadDays).toEqual([7, 3, 1])
    expect(body.cycle).toBe('monthly')
    expect(body.status).toBe('active')
  })

  it('materializes jobs on create (visible via /v1/reminders/upcoming)', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    await post('/v1/subscriptions', cookie, {
      name: 'Netflix',
      nextRenewalDate: '2027-06-15',
      leadDays: [7, 1],
    })
    await post('/v1/channels', cookie, { type: 'email', target: { email: 'a@example.com' } })

    const res = await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    const rows = (await res.json()) as any
    // Only the nearest occurrence surfaces here: 1 occurrence x 2 leadDays x 1
    // channel = 2. A second occurrence is also materialized under the hood
    // (horizon=2, for the worker's rollover gap) but isn't shown as upcoming yet.
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r: { occurrenceDate: string }) => r.occurrenceDate))).toEqual(
      new Set(['2027-06-15']),
    )
  })

  it('scopes the list to the authenticated user only', async () => {
    const cookieA = await signIn(testApp, 'a@example.com')
    const cookieB = await signIn(testApp, 'b@example.com')
    await post('/v1/subscriptions', cookieA, { name: 'A sub', nextRenewalDate: '2026-01-01' })
    await post('/v1/subscriptions', cookieB, { name: 'B sub', nextRenewalDate: '2026-01-01' })

    const resA = await testApp.app.request('/v1/subscriptions', { headers: { cookie: cookieA } })
    const rowsA = (await resA.json()) as any
    expect(rowsA).toHaveLength(1)
    expect(rowsA[0].name).toBe('A sub')
  })

  it("404s (not 403) when reading another user's subscription", async () => {
    const cookieA = await signIn(testApp, 'a@example.com')
    const cookieB = await signIn(testApp, 'b@example.com')
    const created = (await (
      await post('/v1/subscriptions', cookieA, { name: 'A sub', nextRenewalDate: '2026-01-01' })
    ).json()) as any

    const res = await testApp.app.request(`/v1/subscriptions/${created.id}`, {
      headers: { cookie: cookieB },
    })
    expect(res.status).toBe(404)
  })

  it("404s when patching or deleting another user's subscription", async () => {
    const cookieA = await signIn(testApp, 'a@example.com')
    const cookieB = await signIn(testApp, 'b@example.com')
    const created = (await (
      await post('/v1/subscriptions', cookieA, { name: 'A sub', nextRenewalDate: '2026-01-01' })
    ).json()) as any

    const patchRes = await testApp.app.request(`/v1/subscriptions/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: cookieB },
      body: JSON.stringify({ name: 'hijacked' }),
    })
    expect(patchRes.status).toBe(404)

    const deleteRes = await testApp.app.request(`/v1/subscriptions/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: cookieB },
    })
    expect(deleteRes.status).toBe(404)
  })

  it('re-anchors anchorDay when nextRenewalDate is edited directly', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const created = (await (
      await post('/v1/subscriptions', cookie, { name: 'Sub', nextRenewalDate: '2026-01-15' })
    ).json()) as any
    expect(created.anchorDay).toBe(15)

    const res = await testApp.app.request(`/v1/subscriptions/${created.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ nextRenewalDate: '2026-03-31' }),
    })
    const body = (await res.json()) as any
    expect(body.anchorDay).toBe(31)
  })

  it('status can be set to paused via PATCH, which deletes pending jobs; active regenerates them', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const sub = (await (
      await post('/v1/subscriptions', cookie, { name: 'Sub', nextRenewalDate: '2027-06-01' })
    ).json()) as any
    await post('/v1/channels', cookie, { type: 'email', target: { email: 'a@example.com' } })

    const pauseRes = await testApp.app.request(`/v1/subscriptions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ status: 'paused' }),
    })
    expect(((await pauseRes.json()) as any).status).toBe('paused')
    const afterPause = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(afterPause).toHaveLength(0)

    const resumeRes = await testApp.app.request(`/v1/subscriptions/${sub.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ status: 'active' }),
    })
    expect(((await resumeRes.json()) as any).status).toBe('active')
    const afterResume = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(afterResume.length).toBeGreaterThan(0)
  })

  it('delete cascades its notification_jobs', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const sub = (await (
      await post('/v1/subscriptions', cookie, { name: 'Sub', nextRenewalDate: '2027-06-01' })
    ).json()) as any
    await post('/v1/channels', cookie, { type: 'email', target: { email: 'a@example.com' } })
    expect(
      (
        (await (
          await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
        ).json()) as any
      ).length,
    ).toBeGreaterThan(0)

    const deleteRes = await testApp.app.request(`/v1/subscriptions/${sub.id}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(deleteRes.status).toBe(204)

    const after = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(after).toHaveLength(0)
  })

  it('rejects custom_days cycle without intervalDays', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const res = await post('/v1/subscriptions', cookie, {
      name: 'Sub',
      nextRenewalDate: '2027-06-01',
      cycle: 'custom_days',
    })
    expect(res.status).toBe(400)
  })
})
