import { describe, expect, it } from 'vitest'
import { computeBackoffMs } from './backoff.js'

const noJitter = () => 0.5 // computeBackoffMs maps this to the 1.0x multiplier

describe('computeBackoffMs', () => {
  it('doubles with each additional attempt', () => {
    expect(computeBackoffMs(1, noJitter)).toBe(60_000)
    expect(computeBackoffMs(2, noJitter)).toBe(120_000)
    expect(computeBackoffMs(3, noJitter)).toBe(240_000)
  })

  it('caps at 6 hours no matter how many attempts', () => {
    expect(computeBackoffMs(30, noJitter)).toBe(6 * 60 * 60_000)
  })

  it('applies jitter within +/-15%', () => {
    const base = computeBackoffMs(2, noJitter)
    expect(computeBackoffMs(2, () => 0)).toBeCloseTo(base * 0.85, -2)
    expect(computeBackoffMs(2, () => 1)).toBeCloseTo(base * 1.15, -2)
  })
})
