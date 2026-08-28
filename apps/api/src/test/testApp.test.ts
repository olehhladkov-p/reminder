import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createTestApp, signIn, type TestApp } from './testApp.js'

describe('test harness', () => {
  let testApp: TestApp

  beforeEach(async () => {
    testApp = await createTestApp()
  })

  afterAll(async () => {
    await testApp?.close()
  })

  it('rejects unauthenticated requests to a protected route', async () => {
    const res = await testApp.app.request('/v1/me')
    expect(res.status).toBe(401)
  })

  it('serves the OpenAPI doc without auth', async () => {
    const res = await testApp.app.request('/v1/openapi.json')
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.paths['/v1/me']).toBeDefined()
  })

  it('completes a full magic-link sign-in and creates the domain user via the hook', async () => {
    const cookie = await signIn(testApp, 'test@example.com')
    const res = await testApp.app.request('/v1/me', { headers: { cookie } })
    expect(res.status).toBe(200)
    const body = (await res.json()) as any
    expect(body.email).toBe('test@example.com')
    expect(body.timezone).toBe('UTC')
    expect(body.defaultLeadDays).toEqual([7, 3, 1])
  })
})
