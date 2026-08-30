# Render Preview Environments

## What actually works

`reminder-web` (the static site) gets a real Preview Environment per PR for
free - e.g. `https://reminder-web-pr-2.onrender.com`. Render can do this
because a static-site preview is just files on a CDN, no extra compute
needed.

`reminder-api` cannot get one. Render's Preview Environments feature
requires a paid (Pro or higher) plan for services that need actual compute -
confirmed by checking the reminder-api service directly: enabling Preview
Environments on it and opening a PR generates nothing, while the same steps
on reminder-web work immediately. Render's docs state this requirement but
don't call out the free-tier static-site exception explicitly; the behavior
above is what we observed directly against this account.

A `reminder-web` preview's `/v1/*` calls proxy to the **production**
`reminder-api` (see the `routes` rewrite in `render.yaml` - it's a fixed
string, same for every environment including previews). So:

- **Good for**: previewing frontend-only changes (UI, layout, client-side
  logic) against real data.
- **Not isolated**: there's no separate preview database or preview API. A
  preview deploy signs in and reads/writes through the same production
  backend as the real site. Don't use a preview to test backend changes, and
  be aware that exercising auth/data flows on a preview touches production
  data.

## Local dev stays separate

None of the above affects local development. `DEV_LOG_MAGIC_LINK=true` in
your local `.env` (see `apps/api/src/env.ts`) logs magic-link sign-in URLs to
the console instead of sending real email, and
`pnpm --filter @reminder/api run seed:dev` (re)seeds a fixed `dev@test.com`
user with fake subscriptions in your local/dev database, wiping any stray
`test-*` accounts along the way. Both are local-only; neither needs any
Render configuration.

## If backend preview isolation is wanted later

Getting `reminder-api` its own per-PR preview (with its own database, so
preview testing doesn't touch production data) would need, at minimum:

1. Upgrading the Render workspace to a Pro plan, so `reminder-api` can
   generate a preview instance at all.
2. Working out how to supply `reminder-api`'s secrets (`DATABASE_URL`,
   `BETTER_AUTH_SECRET`, `RESEND_API_KEY`, etc.) to that preview instance -
   Render's docs state plainly that `sync: false` env vars (which is what
   all of these are today) are **not copied to preview environments at
   all**, not even production's value. Render points at "Environment
   Groups" as the mechanism for shared preview secrets, but the exact
   `render.yaml` wiring for that wasn't confirmed while writing this guide.
3. Solving the dynamic-URL problem: each PR's `reminder-api` preview would
   get its own distinct URL (confirmed via reminder-web's own previews,
   which follow this pattern), so `reminder-web`'s `/v1/*` rewrite - a
   static string in `render.yaml` - can't be pointed at it automatically.
   Routing around the rewrite (calling the preview API directly,
   cross-origin) is possible but reintroduces the exact Safari ITP
   cookie-dropping problem `render.yaml`'s current same-origin proxy setup
   was built to avoid (see the comment on reminder-web's `routes` rewrite).

None of this is built. It's a real, non-trivial project (cost decision plus
unverified Render mechanics plus a genuine auth trade-off), not something to
casually enable - revisit this section if/when backend preview isolation
actually becomes a priority.
