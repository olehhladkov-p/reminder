Subscription Reminder — CI and developer checklist

Quick commands
- Install: pnpm install
- Format: pnpm run format
- Biome check (lint/type/format checks): pnpm run check
- Run tests (monorepo): pnpm run test

Pre-push
- A pre-push hook runs the test suite (lefthook). Install lefthook locally with pnpm and run "npx lefthook install" after cloning to enable the hook.

CI
- The repository has a GitHub Actions workflow (.github/workflows/ci.yml) that runs biome checks and the test suite on push and pull requests.

Notes
- Node >=20 is required (see package.json engines).
- This project uses pnpm, turbo, and biome.
