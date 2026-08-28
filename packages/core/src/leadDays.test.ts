import { describe, expect, it } from 'vitest'
import { normalizeLeadDays } from './leadDays.js'

describe('normalizeLeadDays', () => {
  it('dedupes and sorts descending', () => {
    expect(normalizeLeadDays([3, 7, 3, 1, 7, 5])).toEqual([7, 5, 3, 1])
  })

  it('caps at 10 entries', () => {
    const input = Array.from({ length: 15 }, (_, i) => i + 1)
    const result = normalizeLeadDays(input)
    expect(result).toHaveLength(10)
    expect(result).toEqual([15, 14, 13, 12, 11, 10, 9, 8, 7, 6])
  })

  it('drops negative and non-integer values', () => {
    expect(normalizeLeadDays([-1, 2.5, 4, 0])).toEqual([4, 0])
  })
})
