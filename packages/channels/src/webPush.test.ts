import { describe, expect, it } from 'vitest'
import { createWebPushChannel } from './webPush.js'

describe('web push channel target validation', () => {
  const channel = createWebPushChannel({
    publicKey:
      'BEl62iUYgUivxIkv69yViEuiBIa40HI8DLd7qbFmY3TE4wDaBWlXjECe4Zt5vpFY6d6PA9GA1Kt7DZzuVYFB8Kk',
    privateKey: 'UUxI4O8-FbRouAevSmBQ6o18hgE4nSG3qwvJTfKc-ls',
    subject: 'mailto:test@example.com',
  })

  it('rejects a target missing keys', () => {
    expect(channel.validateTarget({ endpoint: 'https://push.example.com/abc' }).ok).toBe(false)
  })

  it('rejects a non-URL endpoint', () => {
    const result = channel.validateTarget({
      endpoint: 'not-a-url',
      keys: { p256dh: 'key', auth: 'secret' },
    })
    expect(result.ok).toBe(false)
  })

  it('accepts a well-formed push subscription', () => {
    const result = channel.validateTarget({
      endpoint: 'https://push.example.com/abc',
      keys: { p256dh: 'key', auth: 'secret' },
    })
    expect(result.ok).toBe(true)
  })
})
