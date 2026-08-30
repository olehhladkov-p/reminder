// Set via apps/web/.env (VITE_API_URL) for local dev, where the API runs on
// a different port with no proxy in front of it. In production this is left
// unset and falls back to the page's own origin - render.yaml proxies /v1/*
// from this static site to the API service, so auth stays same-origin from
// the browser's perspective (see apps/api/src/auth.ts for why that matters).
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? window.location.origin

// The VAPID public key (safe to expose client-side) - must match the server's
// VAPID_PUBLIC_KEY (see apps/api's env.ts) or push subscriptions will fail.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
