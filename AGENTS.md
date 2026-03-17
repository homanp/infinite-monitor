# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Infinite Monitor is a single Next.js 16 application (not a monorepo) that builds AI-powered dashboard widgets. Users describe widgets in natural language; an AI agent writes React code, builds it inside a Docker container via Vite, and serves the result in an iframe on an infinite canvas. SQLite (via `better-sqlite3` + Drizzle ORM) handles persistence; no external database service is needed.

### Prerequisites

- **Node.js 20+** with **npm** (lockfile: `package-lock.json`)
- **Docker** must be running — the app uses `dockerode` to spawn widget build containers at runtime
- The **`widget-base:latest`** Docker image must be built before widgets can be created: `docker build -t widget-base:latest docker/widget-base`

### Key commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Build widget-base image | `docker build -t widget-base:latest docker/widget-base` |
| Dev server | `npm run dev` (port 3000) |
| Lint | `npm run lint` |
| Tests | `npm test` (vitest) |
| Production build | `npm run build` |

See `Makefile` for shorthand targets (`make setup`, `make dev`, `make lint`, `make test`, etc.).

### Non-obvious notes

- **Docker is required at runtime**, not just for deployment. The Next.js API routes use `dockerode` to create/manage widget containers. If Docker is not running, widget creation will fail.
- **AI provider API keys** are entered via the UI (BYOK) or set in `.env.local`. The app works without any server-side keys — users paste keys in the chat sidebar. See `.env.example` for the full list of supported providers.
- **SQLite database** is auto-created at `./data/widgets.db` (or `DATABASE_PATH` env var). No migrations command is needed; the schema is applied automatically.
- **Husky pre-commit hook** runs `lint-staged` which executes ESLint and TypeScript type-checking on staged `src/**/*.{ts,tsx}` files.
- The Docker daemon in the Cloud Agent VM requires `sudo dockerd` to start and `sudo chmod 666 /var/run/docker.sock` for non-root access. The storage driver must be `fuse-overlayfs` and iptables must use legacy mode (see Docker-in-Docker setup for Firecracker VMs).
