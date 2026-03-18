# Changelog

All notable changes to Infinite Monitor are documented here.

## Unreleased

### Added

- MCP (Model Context Protocol) server configuration with Cursor-style marketplace UI, per-server logos, and chat sidebar integration ([#40](https://github.com/homanp/infinite-monitor/pull/40))
- New widget placement logic — widgets appear at the top of the canvas, shifting existing items down ([#41](https://github.com/homanp/infinite-monitor/pull/41))
- OG image and Twitter card image with InfiniteMonitor logo on black background ([#42](https://github.com/homanp/infinite-monitor/pull/42))
- Text block support for canvas titles and annotations ([#37](https://github.com/homanp/infinite-monitor/pull/37))
- Unified "Add" dropdown menu replacing separate Add Widget and Add Text buttons ([#37](https://github.com/homanp/infinite-monitor/pull/37))
- Custom web search tool with Brin security scanning for agent queries ([#22](https://github.com/homanp/infinite-monitor/pull/22))
- Docker Compose deployment with Dockerfile and CI/CD pipeline ([#28](https://github.com/homanp/infinite-monitor/pull/28))
- Caddy reverse proxy with auto HTTPS for infinitemonitor.com ([#28](https://github.com/homanp/infinite-monitor/pull/28))
- Favicon and Apple touch icon ([#29](https://github.com/homanp/infinite-monitor/pull/29))
- OpenAI GPT-5.4 mini and nano models ([#35](https://github.com/homanp/infinite-monitor/pull/35))
- AGENTS.md with Cursor Cloud development environment instructions ([#32](https://github.com/homanp/infinite-monitor/pull/32))
- Infinite canvas dashboard replacing the fixed grid layout — pan, zoom, and freely position widgets ([#18](https://github.com/homanp/infinite-monitor/pull/18))
- Interactive minimap showing widget positions and current viewport ([#19](https://github.com/homanp/infinite-monitor/pull/19))
- Portable dashboard templates bundled as static JSON files ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- Auto fit-to-view after applying a template ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- `deps.json` support in widget bootstrap to install extra packages for template widgets ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- BYOK (Bring Your Own Key) model selection with 12 providers and 35+ models ([#17](https://github.com/homanp/infinite-monitor/pull/17))
- Inline model picker and GitHub star button in the UI ([#17](https://github.com/homanp/infinite-monitor/pull/17))
- Vitest unit test suite with CI test job
- GitHub CI workflows (lint, typecheck, test), issue templates, and PR template ([#10](https://github.com/homanp/infinite-monitor/pull/10))
- Pre-commit hooks via lint-staged ([#10](https://github.com/homanp/infinite-monitor/pull/10))

### Changed

- Entire widget header is now draggable, not just the drag icon ([#38](https://github.com/homanp/infinite-monitor/pull/38))
- Add menu dropdown items use uppercase text with matching font size ([#39](https://github.com/homanp/infinite-monitor/pull/39))
- MCP configuration UI redesigned to match Cursor's settings pattern ([#40](https://github.com/homanp/infinite-monitor/pull/40))
- README trimmed from 244 to 136 lines ([#30](https://github.com/homanp/infinite-monitor/pull/30))
- Removed BugBot CI workflow in favor of automatic reviews
- Consolidated 9 agent tools down to 6 using bash-tool
- Updated README tool list to reflect the 6-tool architecture

### Fixed

- Client API keys now properly forwarded to AI providers ([#27](https://github.com/homanp/infinite-monitor/pull/27))
- Next.js binds to all interfaces in Docker for container networking ([#27](https://github.com/homanp/infinite-monitor/pull/27))
- Add button always visible in MCP marketplace list ([#40](https://github.com/homanp/infinite-monitor/pull/40))
- Dead `isSafe` export removed; web search filter uses `.safe` property ([#22](https://github.com/homanp/infinite-monitor/pull/22))
- Canvas zoom-to-cursor by removing 200 k px margin trick that broke coordinate math at non-1× zoom levels ([#19](https://github.com/homanp/infinite-monitor/pull/19))
- Canvas panning using `data-canvas-bg`/`data-widget` attributes instead of strict target check ([#19](https://github.com/homanp/infinite-monitor/pull/19))
- Stale closure in wheel handler by reading viewport from ref ([#19](https://github.com/homanp/infinite-monitor/pull/19))
- Dot-grid background now drawn via CSS `background-position` ([#19](https://github.com/homanp/infinite-monitor/pull/19))
- Manually arranged canvas layouts saved per template (Crypto Trader, World Conflicts, Prediction Markets) ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- Skip non-`src` files in bootstrap to prevent cascade failure ([#20](https://github.com/homanp/infinite-monitor/pull/20))
- Zustand hydration pattern restored for SSR compatibility
- Lint and type errors resolved for CI compliance
- CI lockfile compatibility across platforms (Node 20 with `npm install`)

## 0.1.0 — 2026-03-14

Initial open-source release.

### Added

- AI-powered widget builder — describe a widget in plain English and an agent writes, builds, and deploys it live
- Chat sidebar for creating and iterating on widgets with file upload support (drag-and-drop)
- Docker + Vite widget runtime replacing the original Vercel Sandbox approach
- Single container architecture serving all widgets
- SQLite persistence via Drizzle ORM
- Multi-dashboard support with sync and picker
- Dashboard template gallery on empty state
- Sandboxed bash tool for widget agents
- Thinking blocks and planning indicator in chat UX
- Static noise overlay shown while widgets rebuild
- README, MIT license, and `.env.example` for open-source release
- Demo GIF in README

### Fixed

- Widget file persistence, container stability, and dashboard-aware agents
- Proper cleanup of widget files from disk when container stops
- Dashboard and widget deletion from both client and server
- Config-based template registry instead of fragile name matching
- Native dependency handling for just-bash in Next.js config
- Sandbox root prefix stripping from file paths

### Changed

- Replaced Vercel Sandbox with Docker + Vite for widget isolation
- UI polish: thin scrollbars, reasoning block height, grid bottom padding
