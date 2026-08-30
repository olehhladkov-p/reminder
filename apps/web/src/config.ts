// Set via apps/web/.env (VITE_API_URL) for local dev, where the API runs on
// a different port with no proxy in front of it. In production this is left
// unset and falls back to the page's own origin - render.yaml proxies /v1/*
// from this static site to the API service, so auth stays same-origin from
// the browser's perspective (see apps/api/src/auth.ts for why that matters).
//
// Preview environments set this to the preview API's own URL instead (see
// render.yaml and CROSS_ORIGIN_AUTH in apps/api/src/env.ts), calling it
// directly rather than through the proxy. Render's fromService may resolve
// to a bare host with no scheme, so tolerate that form too.
const rawApiUrl = import.meta.env.VITE_API_URL
export const API_BASE_URL = rawApiUrl
  ? rawApiUrl.includes('://')
    ? rawApiUrl
    : `https://${rawApiUrl}`
  : window.location.origin

// The VAPID public key (safe to expose client-side) - must match the server's
// VAPID_PUBLIC_KEY (see apps/api's env.ts) or push subscriptions will fail.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
