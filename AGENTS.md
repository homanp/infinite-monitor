# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Infinite Monitor is a single Next.js 16 application (not a monorepo) that builds AI-powered dashboard widgets. Users describe widgets in natural language; an AI agent writes React code, bundles it server-side with esbuild, and serves the result in an iframe on an infinite canvas. SQLite (via `better-sqlite3` + Drizzle ORM) handles persistence; no external database service is needed.

### Prerequisites

- **Node.js 20+** with **npm** (lockfile: `package-lock.json`)
- No Docker required — widget builds use esbuild natively on the server

### Key commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| Tests | `npm test` (vitest) |
| Production build | `npm run build` |

See `Makefile` for shorthand targets (`make setup`, `make dev`, `make lint`, `make test`, etc.).

### Non-obvious notes

- **Widget builds use esbuild** server-side. No Docker, no containers. The AI-generated React code is bundled via esbuild with external dependencies loaded from esm.sh CDN. Built widgets are written to `data/widgets-dist/` and served directly by Next.js API routes.
- **AI provider API keys** are entered via the UI (BYOK) or set in `.env.local`. The app works without any server-side keys — users paste keys in the chat sidebar. See `.env.example` for the full list of supported providers. If you add/change `.env.local` while the dev server is running, you must restart the dev server for the new keys to take effect.
- **SQLite database** is auto-created at `./data/widgets.db` (or `DATABASE_PATH` env var). No migrations command is needed; the schema is applied automatically.
- **Husky pre-commit hook** runs `lint-staged` which executes ESLint and TypeScript type-checking on staged `src/**/*.{ts,tsx}` files.
