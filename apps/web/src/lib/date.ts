/** "Sep 29" (or "Sep 29, 2027" when it isn't the current year). */
export function formatFriendlyDate(isoDate: string): string {
  const target = new Date(`${isoDate}T00:00:00`)
  const today = new Date()

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: target.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  }).format(target)
}

function toLocalIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Same day as {@link formatFriendlyDate}, plus a 24-hour local time - e.g. "Sep 29 at 17:00". */
export function formatFriendlyDateTime(date: Date): string {
  const day = formatFriendlyDate(toLocalIsoDate(date))
  const time = new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date)
  return `${day} at ${time}`
}
