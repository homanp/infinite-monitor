import { streamText, stepCountIs, tool } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { z } from "zod";
import { createModel, isAnthropicModel } from "@/lib/create-model";
import { Bash } from "just-bash";
import { createBashTool } from "bash-tool";
import {
  writeWidgetFile,
  readWidgetFile,
  rebuildWidget,
} from "@/lib/widget-builder";
import {
  getAllDashboards,
  getWidget,
  getWidgetFiles,
} from "@/db/widgets";
import { webSearch, type SearchProvider } from "@/lib/web-search";
import { scanUrls } from "@/lib/brin";

interface McpServerPayload {
  name: string;
  type: "command" | "sse" | "streamableHttp";
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

const SYSTEM_PROMPT = `You are a coding agent that builds React widget components.

The widget runs in a Vite + React environment with Tailwind CSS and shadcn/ui.

## What You Are Building

One focused widget — NOT an app, NOT a page, NOT a dashboard. The widget is embedded as an iframe inside a parent dashboard that ALREADY provides:
- A title bar with the widget name
- An expand/collapse button
- A close button

DO NOT recreate any of these. Just build the core content the user asks for.

## File Structure

\`src/App.tsx\` is the entry point. You can create additional files to keep things organized:

\`\`\`
src/
  App.tsx                  ← entry point (default export: App)
  components/Chart.tsx     ← reusable components
  components/DataTable.tsx
  hooks/useData.ts         ← custom hooks
  lib/api.ts               ← utilities, API helpers
  types.ts                 ← shared types
\`\`\`

Use the \`writeFile\` tool to write files. Writing \`src/App.tsx\` triggers a container rebuild.

## Component Rules

- \`src/App.tsx\` must default-export a React component named \`App\`
- Write TypeScript JSX (.tsx) for components, TypeScript (.ts) for non-JSX
- Root layout: \`<div className="w-full h-full overflow-auto p-4 space-y-4">…</div>\`

## Available Packages (pre-installed)

\`\`\`tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { LineChart, AreaChart, BarChart, PieChart, Line, Area, Bar, Pie, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, RefreshCw, Search, AlertCircle } from "lucide-react"; // any lucide icon
import { format, formatDistanceToNow, subDays } from "date-fns";
import maplibregl from "maplibre-gl";
import { motion, AnimatePresence } from "framer-motion";
\`\`\`

## shadcn/ui Components

All shadcn components are pre-installed. Import from \`@/components/ui/*\`:

\`\`\`tsx
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
\`\`\`

Utility: \`import { cn } from "@/lib/utils";\`

## Data Fetching

For external APIs, use the CORS proxy provided by the host app:
\`\`\`tsx
const res = await fetch("/api/proxy?url=" + encodeURIComponent("https://api.example.com/data"));
const data = await res.json();
\`\`\`

Use \`useEffect\` with \`setInterval\` for polling. Always handle loading and error states.

## Styling

- Tailwind CSS utility classes for all styling
- Dark theme active (html has class="dark")
- Use light text: text-zinc-100, text-zinc-300, text-white
- Charts: bright colours (#60a5fa, #34d399, #f87171, #fbbf24, #a78bfa)
- No rounded corners
- Monospace font is default, base 13px

## Workflow

1. Briefly explain what you will build (1-2 sentences max).
2. Write helper files first (\`writeFile\` for components, hooks, utils).
3. Write \`src/App.tsx\` LAST — this triggers the container build.
4. Use \`readFile\` to inspect existing code when iterating.
5. If you spot issues, fix the affected files and write \`src/App.tsx\` again to rebuild.

## Dashboard Awareness

You are building one widget within a larger dashboard. Use \`listDashboardWidgets\` to see what other widgets exist — their titles, descriptions, and whether they have code. Use \`readWidgetCode\` to inspect a sibling widget's source code when you need to match API patterns, data formats, or styling conventions.

Design your widget to complement the others. Don't duplicate what they already show.

Keep the widget focused, clean, and production-quality.`;

export async function POST(request: Request) {
  const body = await request.json();
  const {
    messages,
    widgetId,
    model: modelStr,
    apiKey,
    searchProvider,
    searchApiKey,
    mcpServers: mcpServerConfigs,
  } = body as {
    messages: Array<{
      role: "user" | "assistant";
      content: string | Array<Record<string, unknown>>;
    }>;
    widgetId: string;
    model?: string;
    apiKey?: string;
    searchProvider?: SearchProvider;
    searchApiKey?: string;
    mcpServers?: McpServerPayload[];
  };

  if (!widgetId) {
    return Response.json({ error: "widgetId required" }, { status: 400 });
  }

  const selectedModel = modelStr ?? "anthropic:claude-sonnet-4-6";
  const useAnthropic = isAnthropicModel(selectedModel);

  const SANDBOX_ROOT = "/widget";

  const widgetSandbox = {
    async executeCommand(command: string) {
      const bash = new Bash({ javascript: true });
      const result = await bash.exec(command);
      return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
    },
    async readFile(absolutePath: string) {
      const relative = absolutePath.startsWith(SANDBOX_ROOT + "/")
        ? absolutePath.slice(SANDBOX_ROOT.length + 1)
        : absolutePath.startsWith("/") ? absolutePath.slice(1) : absolutePath;
      const content = await readWidgetFile(widgetId, relative);
      if (content === null) throw new Error(`File not found: ${relative}`);
      return content;
    },
    async writeFiles(files: Array<{ path: string; content: string | Buffer }>) {
      for (const f of files) {
        const relative = f.path.startsWith(SANDBOX_ROOT + "/")
          ? f.path.slice(SANDBOX_ROOT.length + 1)
          : f.path.startsWith("/") ? f.path.slice(1) : f.path;
        const content = typeof f.content === "string" ? f.content : f.content.toString("utf-8");
        await writeWidgetFile(widgetId, relative, content);
        if (relative === "src/App.tsx") {
          rebuildWidget(widgetId).catch(console.error);
        }
      }
    },
  };

  const { tools: bashTools } = await createBashTool({
    sandbox: widgetSandbox,
    destination: SANDBOX_ROOT,
  });

  const listDashboardWidgetsTool = tool({
    description:
      "List all widgets on the same dashboard as the current widget. Returns titles, descriptions, and whether they have code built. Use this to understand the dashboard context and avoid duplicating what other widgets already show.",
    inputSchema: z.object({}),
    execute: async () => {
      const allDashboards = getAllDashboards();
      const parentDashboard = allDashboards.find((d) => {
        const ids: string[] = d.widgetIdsJson ? JSON.parse(d.widgetIdsJson) : [];
        return ids.includes(widgetId);
      });
      if (!parentDashboard) return { dashboard: null, widgets: [] };

      const widgetIds: string[] = JSON.parse(parentDashboard.widgetIdsJson || "[]");
      const siblings = widgetIds
        .filter((id) => id !== widgetId)
        .map((id) => {
          const w = getWidget(id);
          if (!w) return null;
          return { id: w.id, title: w.title, description: w.description, hasCode: !!w.code };
        })
        .filter(Boolean);

      return { dashboard: parentDashboard.title, currentWidgetId: widgetId, widgets: siblings };
    },
  });

  const readWidgetCodeTool = tool({
    description:
      "Read the source code of another widget on the dashboard. Use this to match API patterns, data formats, or styling conventions used by sibling widgets.",
    inputSchema: z.object({
      targetWidgetId: z.string().describe("The ID of the sibling widget to read"),
      path: z
        .string()
        .default("src/App.tsx")
        .describe("File path to read (default: src/App.tsx)"),
    }),
    execute: async ({ targetWidgetId, path }) => {
      const files = getWidgetFiles(targetWidgetId);
      const content = files[path];
      if (!content) return { error: "File not found", targetWidgetId, path };
      const w = getWidget(targetWidgetId);
      return { title: w?.title, path, content };
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools: Record<string, any> = {
    ...bashTools,
    listDashboardWidgets: listDashboardWidgetsTool,
    readWidgetCode: readWidgetCodeTool,
  };

  if (searchProvider && searchApiKey) {
    tools.web_search = tool({
      description:
        "Search the web for current information. Use this when you need up-to-date data, documentation, or API references.",
      inputSchema: z.object({
        query: z.string().describe("The search query"),
      }),
      execute: async ({ query }) => {
        const results = await webSearch(searchProvider, query, searchApiKey);
        const scans = await scanUrls(results.map((r) => r.url));
        return results
          .map((r, i) => ({ ...r, brin: scans[i] }))
          .filter((r) => r.brin.safe);
      },
    });
  }

  const mcpClients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  if (mcpServerConfigs && mcpServerConfigs.length > 0) {
    const results = await Promise.allSettled(
      mcpServerConfigs.map(async (cfg) => {
        let client: Awaited<ReturnType<typeof createMCPClient>>;

        if (cfg.type === "command") {
          const { Experimental_StdioMCPTransport } = await import("@ai-sdk/mcp/mcp-stdio");
          client = await createMCPClient({
            transport: new Experimental_StdioMCPTransport({
              command: cfg.command!,
              args: cfg.args ?? [],
              env: { ...process.env, ...(cfg.env ?? {}) } as Record<string, string>,
            }),
          });
        } else {
          const transportType = cfg.type === "streamableHttp" ? "http" : "sse";
          client = await createMCPClient({
            transport: {
              type: transportType,
              url: cfg.url!,
              headers: cfg.headers ?? {},
            },
          });
        }

        mcpClients.push(client);
        const mcpTools = await client.tools();
        return { name: cfg.name, tools: mcpTools };
      })
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        Object.assign(tools, result.value.tools);
      } else {
        console.error("[MCP] Failed to connect:", result.reason);
      }
    }
  }

  const result = streamText({
    model: createModel(selectedModel, apiKey),
    system: SYSTEM_PROMPT,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: messages as any,
    tools,
    stopWhen: stepCountIs(40),
    abortSignal: request.signal,
    ...(useAnthropic
      ? {
          providerOptions: {
            anthropic: {
              thinking: { type: "adaptive" },
              effort: "high",
            },
          },
        }
      : {}),
  });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case "reasoning-delta":
              send({ type: "reasoning-delta", text: part.text });
              break;

            case "text-delta":
              send({ type: "text-delta", text: part.text });
              break;

            case "tool-call": {
              const input = part.input as Record<string, unknown> | undefined;
              if (part.toolName === "writeFile") {
                send({ type: "widget-file", path: input?.path, content: input?.content });
                if (input?.path === "src/App.tsx") {
                  send({ type: "widget-code", code: input?.content });
                }
                send({
                  type: "tool-call",
                  toolName: "writeFile",
                  args: { path: input?.path },
                });
              } else if (part.toolName === "readFile") {
                send({
                  type: "tool-call",
                  toolName: "readFile",
                  args: { path: input?.path },
                });
              } else if (part.toolName === "bash") {
                send({
                  type: "tool-call",
                  toolName: "bash",
                  args: { command: input?.command },
                });
              } else if (part.toolName === "listDashboardWidgets") {
                send({
                  type: "tool-call",
                  toolName: "listDashboardWidgets",
                  args: {},
                });
              } else if (part.toolName === "readWidgetCode") {
                send({
                  type: "tool-call",
                  toolName: "readWidgetCode",
                  args: { targetWidgetId: input?.targetWidgetId, path: input?.path },
                });
              } else if (part.toolName === "web_search") {
                send({
                  type: "tool-call",
                  toolName: "web_search",
                  args: { query: input?.query },
                });
              } else {
                send({
                  type: "tool-call",
                  toolName: part.toolName,
                  args: input ?? {},
                });
              }
              break;
            }

            case "tool-result":
              break;

            case "abort":
              send({ type: "abort" });
              break;

            case "error":
              send({ type: "error", error: String(part.error) });
              break;
          }
        }

        send({ type: "done" });
      } catch (err) {
        send({ type: "error", error: String(err) });
      } finally {
        for (const client of mcpClients) {
          client.close().catch(() => {});
        }
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
