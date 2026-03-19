# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Infinite Monitor is a single Next.js 16 application (not a monorepo) that builds AI-powered dashboard widgets. Users describe widgets in natural language; an AI agent writes React code, which is built and served inside a [Secure Exec](https://secureexec.dev/) sandbox (V8 isolate-based secure Node.js execution) via Vite. The result is displayed in an iframe on an infinite canvas. SQLite (via `better-sqlite3` + Drizzle ORM) handles persistence; no external database service is needed.

### Prerequisites

- **Node.js 22+** with **npm** (lockfile: `package-lock.json`) — required for native deps (`isolated-vm` / Secure Exec)
- No Docker required — widget sandboxing is handled by `secure-exec` (V8 isolates)

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

- **Secure Exec sandboxes** are used at runtime to build and serve widgets. Each widget gets its own `NodeRuntime` instance (V8 isolate) with filesystem, networking, and child process capabilities. No Docker daemon is needed.
- **AI provider API keys** are entered via the UI (BYOK) or set in `.env.local`. The app works without any server-side keys — users paste keys in the chat sidebar. See `.env.example` for the full list of supported providers. If you add/change `.env.local` while the dev server is running, you must restart the dev server for the new keys to take effect.
- **SQLite database** is auto-created at `./data/widgets.db` (or `DATABASE_PATH` env var). No migrations command is needed; the schema is applied automatically.
- **Husky pre-commit hook** runs `lint-staged` which executes ESLint and TypeScript type-checking on staged `src/**/*.{ts,tsx}` files.
