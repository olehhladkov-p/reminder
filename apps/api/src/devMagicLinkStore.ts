// In-memory only, single most-recent link - a convenience for local
// development (see DEV_LOG_MAGIC_LINK in env.ts), never meant to survive a
// restart or serve more than one developer at a time.
let last: { email: string; url: string } | undefined

export function setLastDevMagicLink(email: string, url: string): void {
  last = { email, url }
}

export function getLastDevMagicLink(): { email: string; url: string } | undefined {
  return last
}
