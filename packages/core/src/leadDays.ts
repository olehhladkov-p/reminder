/** Dedupe, sort (soonest lead first is descending by day count), and cap at 10 entries. */
export function normalizeLeadDays(leadDays: readonly number[]): number[] {
  const unique = Array.from(new Set(leadDays.filter((d) => Number.isInteger(d) && d >= 0)))
  unique.sort((a, b) => b - a)
  return unique.slice(0, 10)
}
