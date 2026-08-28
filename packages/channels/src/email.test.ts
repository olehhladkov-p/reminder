import { describe, expect, it } from 'vitest'
import { createEmailChannel } from './email.js'

describe('email channel target validation', () => {
  const channel = createEmailChannel({ apiKey: 'test', fromEmail: 'reminders@example.com' })

  it('rejects a non-email target', () => {
    expect(channel.validateTarget({ email: 'not-an-email' }).ok).toBe(false)
    expect(channel.validateTarget({}).ok).toBe(false)
  })

  it('accepts a valid email target', () => {
    const result = channel.validateTarget({ email: 'user@example.com' })
    expect(result.ok).toBe(true)
  })
})
