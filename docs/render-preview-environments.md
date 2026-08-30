# Render Preview Environments

How to get a working preview deploy per PR - one that signs in without sending
real email, uses its own database (not production's), and serves the web app
against its own preview API rather than production's.

Render's per-key "different value for previews" control referenced below is
described from Render's general Preview Environments behavior - the exact
label/flow may differ slightly in your dashboard. Adjust to what you actually
see; the goal (a distinct value for the preview instance of that var) is what
matters.

## 1. Enable Preview Environments

Per-service, not Blueprint-wide: open each service (`reminder-api`,
`reminder-web`) -> Settings -> Preview Environments -> enable (Automatic or
Manual generation).

## 2. Create a Neon branch for preview data

Neon dashboard -> your project -> Branches -> create a branch off `main`,
named e.g. `preview`. It's a copy-on-write snapshot, so it starts with
production's schema and data (including the `dev@test.com` seed user, if it
existed at branch-creation time) with no migration run needed. Copy its
**pooled** connection string - you'll need it in step 3.

## 3. reminder-api: preview-specific env var values

In the `reminder-api` service's Environment tab, give each of these a
separate value for previews (production keeps whatever's already in
`render.yaml`/the dashboard):

| Var | Preview value | Why |
|---|---|---|
| `DEV_LOG_MAGIC_LINK` | `true` | Logs the sign-in link to the service's logs instead of sending real email through Resend. |
| `DATABASE_URL` | the Neon branch connection string from step 2 | Keeps preview sign-ins and test data out of the production database. |
| `CROSS_ORIGIN_AUTH` | `true` | Lets the preview web app call this preview API directly instead of through the (production-only) static-site proxy. See "Why CROSS_ORIGIN_AUTH exists" below. |
| `WEB_APP_ORIGIN` | the preview `reminder-web` instance's own URL | CORS and better-auth's `trustedOrigins` both read this (comma-separated - see `webAppOrigins` in `apps/api/src/env.ts`). Without it, the preview web app's cross-origin requests get rejected. |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | any non-empty placeholder (e.g. `re_placeholder` / `dev@example.com`) | Still required for the process to boot - `channels.ts` builds a Resend client eagerly for reminder-notification email (unrelated to auth), and the SDK throws on an empty key. `DEV_LOG_MAGIC_LINK` only skips *using* Resend for auth; a placeholder is fine since that reminder-delivery path won't be exercised by sign-in testing. |

`BETTER_AUTH_URL` needs **no** preview override - when `CROSS_ORIGIN_AUTH` is
on, `apps/api/src/auth.ts` uses Render's auto-injected `RENDER_EXTERNAL_URL`
(this instance's own actual URL) instead, so it's correct automatically for
every preview without per-PR configuration.

## 4. reminder-web: preview-specific env var value

In the `reminder-web` service's Environment tab, give `VITE_API_URL` a
preview value pointing at that PR's `reminder-api` preview instance URL. If
your dashboard's preview-value flow offers a "link to another service" /
`fromService`-style picker, prefer that - it re-resolves automatically to
each new preview's URL. Otherwise, look up that PR's `reminder-api` preview
URL in the Render dashboard and paste it in by hand each time.

## 5. Seed the preview branch with the dev user

The Neon branch inherits whatever was in production *at the moment you
created it*. To (re-)seed `dev@test.com` with fresh fake data directly on the
preview branch (not production), run the seed script with `DATABASE_URL`
pointed at the branch's connection string instead of your local `.env`:

```bash
DATABASE_URL="<preview branch pooled connection string>" pnpm --filter @reminder/api run seed:dev
```

This also removes any lingering `test-*` accounts on that branch the same
way it does locally.

## Why CROSS_ORIGIN_AUTH exists

Production keeps everything same-origin on purpose: `reminder-web`'s
`/v1/*` route rewrite (`render.yaml`) proxies API calls through the web
app's own domain, so the session cookie is first-party and survives Safari's
Intelligent Tracking Prevention (which silently drops `SameSite=None`
cookies on cross-site fetches - the exact bug this setup was built to avoid).

Render route destinations are static strings, so that rewrite can't be
pointed at "whichever preview API belongs to this PR" - there's no dynamic
per-preview destination available for `routes:` entries. Rather than fix the
rewrite (not possible), preview environments route around it: the web app
calls the preview API directly (cross-origin), which requires the session
cookie to be `SameSite=None; Secure` instead of the production default of
`SameSite=Lax`. `CROSS_ORIGIN_AUTH` (in `apps/api/src/env.ts` /
`apps/api/src/auth.ts`) makes that switch, opt-in and off by default, so
production's Safari-safe same-origin behavior never changes.

The client side needed no changes to support this: `apps/web/src/api/client.ts`
already sends `credentials: 'include'` on every request, and the API's CORS
config (`apps/api/src/app.ts`) already allows credentialed cross-origin
requests from an explicit origin allow-list. The only pieces that were
actually same-origin-only were the cookie's `SameSite` attribute and the
auth base URL - both fixed by `CROSS_ORIGIN_AUTH`.

**Trade-off**: cross-origin cookies reintroduce exactly the Safari ITP
problem production avoids. That's fine for preview - it's for functional
testing, not iOS Safari compatibility testing - but don't flip this on in
production.
