// Set via apps/web/.env (VITE_API_URL) for local dev against a non-default
// API port, or as a build-time env var in the Render Static Site config.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8787'

// The VAPID public key (safe to expose client-side) - must match the server's
// VAPID_PUBLIC_KEY (see apps/api's env.ts) or push subscriptions will fail.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
