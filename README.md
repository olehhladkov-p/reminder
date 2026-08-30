# Subscription Reminder

A monorepo for building a subscription reminder application with a modern tech stack.

## Project Structure

This is a monorepo using **pnpm workspaces** and **Turbo** for managing multiple interdependent packages:

### Applications (`apps/`)
- **api** — Backend API server
- **web** — Web application frontend
- **worker** — Background worker service

### Packages (`packages/`)
- **channels** — Communication channels integration
- **core** — Core business logic and utilities
- **db** — Database schema and migrations

## Requirements

- **Node.js:** >= 24
- **Package Manager:** pnpm >= 11.24.0
- **TypeScript:** 5.9.3+

## Getting Started

### Installation

```bash
# Install dependencies across all packages
pnpm install

# Optional: Install lefthook for pre-push hooks
npx lefthook install
```

### Development

```bash
# Start development servers for all packages
pnpm dev

# Build all packages
pnpm build

# Run tests
pnpm test

# Type checking
pnpm typecheck

# Linting
pnpm lint
```

## Code Quality

### Formatting & Linting

This project uses **Biome** for code formatting and linting:

```bash
# Format code
pnpm format

# Run full checks (lint, type-check, format)
pnpm check
```

### Pre-push Hooks

A pre-push hook automatically runs the test suite using **lefthook**. Install locally with:

```bash
npx lefthook install
```

This ensures tests pass before pushing commits to the repository.

## CI/CD

The repository uses **GitHub Actions** for continuous integration:

- **Workflow:** `.github/workflows/ci.yml`
- **Triggers:** On push and pull requests
- **Checks:** Biome linting/formatting, TypeScript type checking, and test suite

## Tools & Technology

- **Monorepo Management:** [Turbo](https://turbo.build/)
- **Package Manager:** [pnpm](https://pnpm.io/)
- **Code Quality:** [Biome](https://biomejs.dev/)
- **Git Hooks:** [Lefthook](https://github.com/evilmartians/lefthook)
- **Language:** TypeScript
- **Testing:** Vitest (configured in workspace packages)
