# Changelog

All notable changes to Infinite Monitor are documented here.

Sections are ordered **newest first** (by tag date). Git tags: `v0.0.3` (2026-03-18), `v0.0.2` (2026-03-17), `v0.1.0` (2026-03-16).

## Unreleased

### Added

- **Dashboard sharing** — stable sharing with live session updates via a durable-stream-first architecture (share button, live view, stream recorder)
- Custom OpenAI-compatible API (base URL + key) managed from the model picker ([#46](https://github.com/homanp/infinite-monitor/pull/46))
- **Secure Exec** widget runtime — V8-isolate sandboxes build and serve widgets without Docker (`secure-exec` 0.1.0)
- **CORS proxy POST/OPTIONS** — widgets can make POST requests through the proxy (e.g. OAuth2 token exchange) with proper CORS preflight handling
- **Streamed tool call actions** — tool calls shown in the UI as soon as the model begins generating them, before full content is available
- **SSE keepalive** — 15-second heartbeat prevents Railway proxy timeout on long-running AI streams
- **PR commit security scan** CI workflow
- **Railway deployment** config (`railway.toml`) and prebuild template script for faster startup

### Changed

- README and docs describe Secure Exec instead of Docker for widget isolation
- CI uses **Node 22** for `secure-exec` native dependency compatibility
- `next.config`: `secure-exec` listed in `serverExternalPackages`; `dockerode` removed
- Composer footer: model, search, and MCP controls grouped left; attachment and submit anchored right
- Planning indicator hidden while reasoning is streaming; shown only when no tool call is active
- Share button and live view components refactored and simplified
- Shared view reasoning uses native `<details>`/`<summary>` elements
- README documents desktop app option

### Removed

- Docker-based widget sandboxing and related deployment assets (DigitalOcean / Docker Compose stack, Caddy-focused infra)
- Next.js `standalone` output (simplifies hosted builds such as Railway)

### Fixed

- Sandbox reliability: real filesystem, shared base template, async builds, host-level fetch where appropriate
- Widget iframe showed **Widget not found** after applying a dashboard template
- Railway build: exclude `drizzle.config.ts` from the production typecheck graph
- Active dashboard showed widgets from other dashboards after switching
- Authorization header dropped by CORS proxy on authenticated requests
- CORS headers missing from proxy error responses, blocking widgets from reading error bodies
- Cached widget restores not serialized, causing race conditions on startup
- Widget build cache lost across server restarts
- Missing `SHARE_ID_SECRET` threw unhandled error instead of a graceful response
- Auto-create durable stream bucket on first share instead of erroring
- Production widget proxy stability: reduced repeated hits from freshly generated widgets
- Railway npm compatibility issues
- New widgets shifted existing canvas items instead of occupying the next free slot
- Chat tool status disappeared too quickly; planning indicator flashed during active tool calls
- SQLite race condition when concurrent Next.js build workers initialized the schema
- Network errors on long-running AI streams — added `maxDuration`, fetch timeout, and client-side retry

## 0.0.3 — 2026-03-18

### Added

- MCP (Model Context Protocol) server configuration with Cursor-style marketplace UI, per-server logos, and chat-sidebar entry ([#40](https://github.com/homanp/infinite-monitor/pull/40))
- Open Graph and Twitter card images (InfiniteMonitor logo on black) ([#42](https://github.com/homanp/infinite-monitor/pull/42))
- **Text blocks** on the canvas for titles and annotations ([#37](https://github.com/homanp/infinite-monitor/pull/37))
- Unified **Add** dropdown (widget + text) replacing separate buttons ([#37](https://github.com/homanp/infinite-monitor/pull/37))

### Changed

- New widgets are placed at the **top** of the canvas, shifting existing items down ([#41](https://github.com/homanp/infinite-monitor/pull/41))
- Entire widget **header** is draggable, not only the drag handle ([#38](https://github.com/homanp/infinite-monitor/pull/38))
- MCP configuration UI aligned with Cursor-style settings ([#40](https://github.com/homanp/infinite-monitor/pull/40))
- Add menu dropdown styling: uppercase labels with consistent font size ([#39](https://github.com/homanp/infinite-monitor/pull/39))

### Fixed

- **Add** control always visible in the MCP marketplace list ([#40](https://github.com/homanp/infinite-monitor/pull/40))
- New widget placement iterated: below existing stack, then refined to top-of-canvas behavior ([#41](https://github.com/homanp/infinite-monitor/pull/41))

## 0.0.2 — 2026-03-17

### Added

- **AGENTS.md** — Cursor Cloud / local dev notes (incl. API key env restart caveat) ([#32](https://github.com/homanp/infinite-monitor/pull/32))
- OpenAI **GPT-5.4** mini and nano models in the picker ([#35](https://github.com/homanp/infinite-monitor/pull/35))

### Changed

- Changelog brought up to date for earlier canvas, minimap, and template work ([#36](https://github.com/homanp/infinite-monitor/pull/36))
- `package-lock.json` refreshed for cross-platform optional deps

## 0.1.0 — 2026-03-16

Initial open-source release (tag `v0.1.0`).

### Added

- AI-powered widget builder — natural language → agent writes, builds, and serves widgets in a sandbox
- Chat sidebar with file upload (drag-and-drop) and iteration on widget code
- **Docker + Vite**-based widget runtime (replacing the earlier Vercel Sandbox approach) — *superseded in `main` by Secure Exec; see Unreleased*
- SQLite persistence via Drizzle ORM; multi-dashboard sync and picker
- Dashboard template gallery on empty state; portable templates as static JSON ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- **Infinite canvas** — pan, zoom, free placement ([#18](https://github.com/homanp/infinite-monitor/pull/18))
- Interactive **minimap** for viewport and widget positions ([#19](https://github.com/homanp/infinite-monitor/pull/19))
- Auto **fit-to-view** after applying a template; `deps.json` in widget bootstrap for extra packages ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- **BYOK** model selection — multiple providers and models ([#17](https://github.com/homanp/infinite-monitor/pull/17))
- Inline model picker and GitHub star affordance ([#17](https://github.com/homanp/infinite-monitor/pull/17))
- Custom **web search** tool with Brin security filtering ([#22](https://github.com/homanp/infinite-monitor/pull/22))
- **Docker Compose** deployment, Dockerfile, CI/CD hints ([#28](https://github.com/homanp/infinite-monitor/pull/28))
- **Caddy** reverse-proxy example with HTTPS for infinitemonitor.com ([#28](https://github.com/homanp/infinite-monitor/pull/28))
- Favicon and Apple touch icon ([#29](https://github.com/homanp/infinite-monitor/pull/29))
- Sandboxed bash tool for agents; thinking/planning indicators; rebuild “noise” overlay
- Vitest + CI (lint, typecheck, test); issue/PR templates; lint-staged pre-commit ([#10](https://github.com/homanp/infinite-monitor/pull/10))
- README, MIT license, `.env.example`, demo GIF

### Changed

- README trimmed for clarity ([#30](https://github.com/homanp/infinite-monitor/pull/30))
- Removed BugBot workflow in favor of automatic reviews
- Tooling consolidated (fewer redundant agent tools; bash-tool story)

### Fixed

- Client API keys forwarded correctly to AI providers ([#27](https://github.com/homanp/infinite-monitor/pull/27))
- Next.js binds to `0.0.0.0` in containers ([#27](https://github.com/homanp/infinite-monitor/pull/27))
- Widget persistence, sandbox cleanup, dashboard-aware agents
- Canvas zoom/pan math and styling fixes ([#19](https://github.com/homanp/infinite-monitor/pull/19))
- Template layouts and bootstrap robustness ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- Web search filter dead export removed ([#22](https://github.com/homanp/infinite-monitor/pull/22))
- Zustand hydration for SSR; CI lockfile / platform compatibility
