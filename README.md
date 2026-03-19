# Infinite Monitor

[![GitHub stars](https://img.shields.io/github/stars/homanp/infinite-monitor?style=social)](https://github.com/homanp/infinite-monitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CI](https://github.com/homanp/infinite-monitor/actions/workflows/ci.yml/badge.svg)](https://github.com/homanp/infinite-monitor/actions/workflows/ci.yml)

An AI-powered dashboard builder. Describe the widget you want in plain English and an AI agent writes, builds, and deploys it in real time.

Each widget is a full React app — with its own dependencies, API calls, charts, maps, and interactive UI — running in an isolated iframe. Drag, resize, and organize them on an infinite canvas for any domain: cybersecurity, OSINT, trading, prediction markets, or anything you can describe.

<p align="center">
  <img src="assets/demo.gif" alt="Infinite Monitor" width="100%">
</p>

## How it works

1. Click **Add Widget** and describe what you want
2. An AI agent writes the React code, installs dependencies, and builds it in a secure sandbox
3. The widget renders live in an iframe on your dashboard
4. Iterate by chatting — the agent rewrites and rebuilds in seconds

## Quick start

### Prerequisites

- [Node.js](https://nodejs.org/) 22+ (needed for Secure Exec’s `isolated-vm` native addon)
- An API key from any [supported provider](#supported-providers) (Anthropic, OpenAI, Google, xAI, Mistral, and more)

### Setup

```bash
git clone https://github.com/homanp/infinite-monitor.git
cd infinite-monitor
```

Create `.env.local` with at least one provider key:

```bash
# Pick any provider — or add multiple
ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# GOOGLE_GENERATIVE_AI_API_KEY=...
```

See [`.env.example`](.env.example) for the full list of supported environment variables.

Install and start:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Next.js App                                            │
│  ┌──────────────────────┐  ┌─────────────────────────┐  │
│  │  Infinite Canvas     │  │  Chat Sidebar           │  │
│  │  (pan / zoom / grid) │  │  (AI conversation)      │  │
│  │                      │  │                          │  │
│  │  ┌──────┐ ┌──────┐   │  │  User: "build a chart"  │  │
│  │  │iframe│ │iframe│   │  │  Agent: writes code...   │  │
│  │  │  w1  │ │  w2  │   │  │  Agent: building...      │  │
│  │  └──────┘ └──────┘   │  │  ✓ Widget ready          │  │
│  └──────────────────────┘  └─────────────────────────┘  │
└──────────────────┬──────────────────────────────────────┘
                   │
     ┌─────────────┼─────────────────┐
     │             │                 │
     ▼             ▼                 ▼
┌─────────┐  ┌──────────┐  ┌─────────────────┐
│ SQLite  │  │ Secure   │  │ AI Providers    │
│ (state) │  │ Exec     │  │ (BYOK)          │
│         │  │ (V8)     │  │                 │
│ widgets │  │ vite     │  │ Anthropic       │
│ layouts │  │ serve    │  │ OpenAI / Google  │
│ files   │  │ dist/    │  │ xAI / Mistral…  │
└─────────┘  └──────────┘  └─────────────────┘
```

**Client** — Next.js 16 + React 19. Zustand store persisted to localStorage. Widgets rendered as iframes on an infinite canvas with pan, zoom, minimap, and grid-snapped placement.

**Server** — Next.js API routes. AI chat uses Vercel AI SDK with any supported provider. Widget files stored in SQLite via Drizzle ORM. CORS proxy for widget API calls.

**Widget Runtime** — Each widget runs in a [Secure Exec](https://secureexec.dev/) sandbox (V8 isolate). The agent writes files, Vite builds them, and the built output is served as static HTML. No Docker required.

**Widget Template** — Each widget gets React 18, Tailwind CSS, Recharts, MapLibre GL, Framer Motion, date-fns, Lucide icons, and all shadcn/ui components out of the box.

## Features

**Bring your own key** — Pick from 15 AI providers and 35+ models. Enter your API key in the UI or set it via environment variables. Switch models per conversation.

**Multiple dashboards** — Create separate dashboards for different domains. Switch between them instantly.

**Dashboard-aware agents** — Each widget's AI agent can see what other widgets exist on the same dashboard and read their source code, so it builds complementary components instead of duplicating work.

**Infinite canvas** — Pan, zoom, and place widgets anywhere on an unbounded grid. Drag widgets by their title bar, resize from the corner handle. Widgets snap to grid cells.

**Live web search** — The agent searches the web for API documentation, data sources, and implementation patterns while building.

**Dashboard templates** — Start from pre-built templates for common domains or build from scratch.

## Supported providers

Supports 15 AI providers including Anthropic, OpenAI, Google, xAI, Mistral, DeepSeek, Groq, and more. Enter your API key in the chat sidebar or set it via environment variables. See [`.env.example`](.env.example) for the full list.

## Security

**Local-first storage** — All API keys are stored in your browser's localStorage. They are sent to the server only for the duration of a request and are never persisted server-side.

**Brin threat scanning** — Every external URL is scanned through [Brin](https://brin.sh) ([GitHub](https://github.com/superagent-ai/brin)) for threats. Web search results and CORS proxy requests with a threat score below 30 are blocked.

## Contributing

Contributions are welcome. Some areas that need work:

- **Templates** — More pre-built dashboard templates for different domains
- **Widget marketplace** — Share and import widgets between users
- **Collaboration** — Real-time multi-user dashboard editing
- **Mobile** — Responsive layout and touch gesture support

## License

MIT
