import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, signIn, type TestApp } from '../test/testApp.js'

describe('reminders/upcoming route', () => {
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
    expect((await testApp.app.request('/v1/reminders/upcoming')).status).toBe(401)
  })

  it('orders by soonest send_at and scopes to the authenticated user', async () => {
    const cookieA = await signIn(testApp, 'a@example.com')
    const cookieB = await signIn(testApp, 'b@example.com')

    const subsByUser: Record<'A' | 'B', string[]> = { A: [], B: [] }
    for (const [label, cookie, email, date] of [
      ['A', cookieA, 'a@example.com', '2027-03-01'],
      ['A', cookieA, 'a@example.com', '2027-01-01'],
      ['B', cookieB, 'b@example.com', '2027-02-01'],
    ] as const) {
      const sub = (await (
        await testApp.app.request('/v1/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', cookie },
          body: JSON.stringify({ name: `sub-${date}`, nextRenewalDate: date, leadDays: [1] }),
        })
      ).json()) as any
      subsByUser[label].push(sub.id)
      await testApp.app.request('/v1/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({ type: 'email', target: { email } }),
      })
    }

    const rows = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie: cookieA } })
    ).json()) as any
    expect(rows.length).toBeGreaterThan(0)
    // Only user A's own subscriptions ever show up, never user B's.
    expect(
      rows.every((r: { subscriptionId: string }) => subsByUser.A.includes(r.subscriptionId)),
    ).toBe(true)
    const sendAts = rows.map((r: { sendAt: string }) => r.sendAt)
    expect(sendAts).toEqual([...sendAts].sort())
  })

  it('only surfaces the nearest occurrence per subscription, not the pre-booked one after it', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    const sub = (await (
      await testApp.app.request('/v1/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie },
        body: JSON.stringify({
          name: 'Sub',
          nextRenewalDate: '2027-06-15',
          cycle: 'monthly',
          leadDays: [7, 3],
        }),
      })
    ).json()) as any
    await testApp.app.request('/v1/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ type: 'email', target: { email: 'a@example.com' } }),
    })

    // materializeJobs() also pre-books the 2027-07-15 occurrence (horizon=2)
    // so the worker has no gap after rollover - it must not show up here.
    const rows = (await (
      await testApp.app.request('/v1/reminders/upcoming', { headers: { cookie } })
    ).json()) as any
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((r: { subscriptionId: string }) => r.subscriptionId === sub.id)).toBe(true)
    expect(new Set(rows.map((r: { occurrenceDate: string }) => r.occurrenceDate))).toEqual(
      new Set(['2027-06-15']),
    )
  })

  it('respects the limit query param', async () => {
    const cookie = await signIn(testApp, 'a@example.com')
    await testApp.app.request('/v1/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        name: 'Sub',
        nextRenewalDate: '2027-06-15',
        leadDays: [7, 5, 3, 1],
      }),
    })
    await testApp.app.request('/v1/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({ type: 'email', target: { email: 'a@example.com' } }),
    })

    const rows = (await (
      await testApp.app.request('/v1/reminders/upcoming?limit=2', { headers: { cookie } })
    ).json()) as any
    expect(rows).toHaveLength(2)
  })
})
