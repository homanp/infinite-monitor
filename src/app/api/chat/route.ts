import { streamText, stepCountIs, tool } from "ai";
import { createMCPClient } from "@ai-sdk/mcp";
import { z } from "zod";
import { createModel, isAnthropicModel } from "@/lib/create-model";
import type { CustomApiConfig } from "@/store/settings-store";
import { Bash } from "just-bash";
import { createBashTool } from "bash-tool";
import {
  writeWidgetFile,
  readWidgetFile,
  rebuildWidget,
} from "@/lib/widget-runner";
import {
  getAllDashboards,
  getWidget,
  getWidgetFiles,
} from "@/db/widgets";
import { webSearch, type SearchProvider } from "@/lib/web-search";
import { scanUrls } from "@/lib/brin";
import { nanoid } from "nanoid";
import { maybeCreateTraceRecorder, publishDashboardStateForWidgetIfShared } from "@/lib/share-recorder";
import type { SharedChatMessage } from "@/lib/share-types";

interface McpServerPayload {
  name: string;
  type: "command" | "sse" | "streamableHttp";
  url?: string;
  command?: string;
  args?: string[];
  headers?: Record<string, string>;
  env?: Record<string, string>;
}

interface CustomApiPayload {
  id: string;
  name: string;
  endpoint: string;
  type: "anthropic" | "openai";
  apiKey?: string;
  models: Array<{ id: string; name: string }>;
  enabled: boolean;
}

const SYSTEM_PROMPT = `You are a coding agent that builds React widget components.

Each widget runs in a secure, isolated sandbox powered by Secure Exec (https://secureexec.dev/) — a V8 isolate-based runtime with full Node.js and npm compatibility. The sandbox uses Vite + React to build your code.

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

Use the \`writeFile\` tool to write files. Writing \`src/App.tsx\` triggers a rebuild inside the Secure Exec sandbox.

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

Only fetch live external data when the user clearly asks for current, remote, or API-backed data.

Never invent API endpoints from memory, and never copy a sibling widget's API URL without re-verifying that it is still valid.

If the \`web_search\` tool is available, use it to verify the current official API docs before writing network code.

If you cannot verify a stable public endpoint, or the API requires auth, rate-limits aggressively, or looks unofficial, ask the user for the API URL/key or build the widget with mock/sample data instead of guessing.

Shared production hosts are often rate-limited by public/demo endpoints, so avoid undocumented or flaky sources unless the user explicitly asked for that exact source and you verified it.

When you do need a verified external API, use the CORS proxy provided by the host app:
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
3. Write \`src/App.tsx\` LAST — this triggers the Secure Exec sandbox build.
4. Use \`readFile\` to inspect existing code when iterating.
5. If you spot issues, fix the affected files and write \`src/App.tsx\` again to rebuild.

## Dashboard Awareness

You are building one widget within a larger dashboard. Use \`listDashboardWidgets\` to see what other widgets exist — their titles, descriptions, and whether they have code. Use \`readWidgetCode\` to inspect a sibling widget's source code when you need to match layout, styling, or data shapes, but treat any sibling network code as potentially stale until you verify it.

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
    customApi,
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
    customApi?: CustomApiPayload;
  };

  if (!widgetId) {
    return Response.json({ error: "widgetId required" }, { status: 400 });
  }

  const traceRecorder = await maybeCreateTraceRecorder(widgetId).catch(() => null);
  traceRecorder?.startRun();

  const selectedModel = modelStr ?? "anthropic:claude-sonnet-4-6";
  const useAnthropic = isAnthropicModel(selectedModel);

  // Prepare custom API config if using a custom provider
  const customConfig: CustomApiConfig | undefined = customApi
    ? {
        id: customApi.id,
        name: customApi.name,
        endpoint: customApi.endpoint,
        type: customApi.type,
        apiKey: customApi.apiKey,
        models: customApi.models,
        enabled: customApi.enabled,
      }
    : undefined;

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
          publishDashboardStateForWidgetIfShared(widgetId).catch(() => {});
        }
        traceRecorder?.record("file-written", `Wrote ${relative}`, { path: relative });
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
      "Read the source code of another widget on the dashboard. Use this to match styling or data shapes, but do not blindly reuse sibling API endpoints without re-verifying them.",
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
    model: createModel(selectedModel, apiKey, customConfig),
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

      const KEEPALIVE_INTERVAL_MS = 15_000;
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, KEEPALIVE_INTERVAL_MS);

      let pendingToolInput: {
        toolName: string;
        accumulated: string;
        sent: boolean;
      } | null = null;
      let assistantText = "";
      let assistantReasoning = "";
      let reasoningStartedAt: number | null = null;
      let reasoningDurationMs: number | null = null;

      try {
        for await (const part of result.fullStream) {
          if (part.type !== "reasoning-delta" && reasoningStartedAt !== null && reasoningDurationMs === null) {
            reasoningDurationMs = Date.now() - reasoningStartedAt;
          }
          switch (part.type) {
            case "reasoning-delta":
              if (reasoningStartedAt === null) reasoningStartedAt = Date.now();
              assistantReasoning += part.text;
              send({ type: "reasoning-delta", text: part.text });
              break;

            case "text-delta":
              assistantText += part.text;
              send({ type: "text-delta", text: part.text });
              break;

            case "tool-input-start":
              pendingToolInput = {
                toolName: part.toolName,
                accumulated: "",
                sent: false,
              };
              send({ type: "tool-call", toolName: part.toolName, args: {} });
              break;

            case "tool-input-delta": {
              if (pendingToolInput && !pendingToolInput.sent) {
                pendingToolInput.accumulated += (part as { delta: string }).delta;
                const text = pendingToolInput.accumulated;
                let extracted: { key: string; value: string } | null = null;

                if (pendingToolInput.toolName === "writeFile" || pendingToolInput.toolName === "readFile") {
                  const m = text.match(/"path"\s*:\s*"([^"]+)"/);
                  if (m) extracted = { key: "path", value: m[1] };
                } else if (pendingToolInput.toolName === "bash") {
                  const m = text.match(/"command"\s*:\s*"([^"]+)"/);
                  if (m) extracted = { key: "command", value: m[1] };
                } else if (pendingToolInput.toolName === "web_search") {
                  const m = text.match(/"query"\s*:\s*"([^"]+)"/);
                  if (m) extracted = { key: "query", value: m[1] };
                }

                if (extracted) {
                  pendingToolInput.sent = true;
                  send({
                    type: "tool-call",
                    toolName: pendingToolInput.toolName,
                    args: { [extracted.key]: extracted.value },
                  });
                }
              }
              break;
            }

            case "tool-call": {
              pendingToolInput = null;
              const input = part.input as Record<string, unknown> | undefined;
              const toolCallId = (part as { toolCallId?: string }).toolCallId;
              const traceDetail = part.toolName === "writeFile" ? `Wrote ${input?.path ?? "file"}`
                : part.toolName === "bash" ? `Ran ${String(input?.command ?? "").slice(0, 80)}`
                : `Called ${part.toolName}`;
              traceRecorder?.record("tool-call", traceDetail, { toolName: part.toolName });
              if (part.toolName === "writeFile") {
                send({ type: "widget-file", path: input?.path, content: input?.content });
                if (input?.path === "src/App.tsx") {
                  send({ type: "widget-code", code: input?.content });
                }
                send({
                  type: "tool-call",
                  toolCallId,
                  toolName: "writeFile",
                  args: { path: input?.path },
                });
              } else if (part.toolName === "readFile") {
                send({
                  type: "tool-call",
                  toolCallId,
                  toolName: "readFile",
                  args: { path: input?.path },
                });
              } else if (part.toolName === "bash") {
                send({
                  type: "tool-call",
                  toolCallId,
                  toolName: "bash",
                  args: { command: input?.command },
                });
              } else if (part.toolName === "listDashboardWidgets") {
                send({
                  type: "tool-call",
                  toolCallId,
                  toolName: "listDashboardWidgets",
                  args: {},
                });
              } else if (part.toolName === "readWidgetCode") {
                send({
                  type: "tool-call",
                  toolCallId,
                  toolName: "readWidgetCode",
                  args: { targetWidgetId: input?.targetWidgetId, path: input?.path },
                });
              } else if (part.toolName === "web_search") {
                send({
                  type: "tool-call",
                  toolCallId,
                  toolName: "web_search",
                  args: { query: input?.query },
                });
              } else {
                send({
                  type: "tool-call",
                  toolCallId,
                  toolName: part.toolName,
                  args: input ?? {},
                });
              }
              break;
            }

            case "tool-result": {
              const resultToolCallId = (part as { toolCallId?: string }).toolCallId;
              const resultToolName = (part as { toolName?: string }).toolName;
              const output = (part as { output?: unknown }).output;

              if (resultToolName === "bash" && output && typeof output === "object") {
                const { stdout, stderr, exitCode } = output as {
                  stdout?: string;
                  stderr?: string;
                  exitCode?: number;
                };
                send({
                  type: "tool-result",
                  toolCallId: resultToolCallId,
                  toolName: resultToolName,
                  result: { stdout: stdout ?? "", stderr: stderr ?? "", exitCode: exitCode ?? 0 },
                });
              } else {
                send({
                  type: "tool-result",
                  toolCallId: resultToolCallId,
                  toolName: resultToolName,
                });
              }
              if (traceRecorder) {
                const effectiveDurationMs = reasoningDurationMs ?? (reasoningStartedAt ? Date.now() - reasoningStartedAt : undefined);
                const interim: SharedChatMessage[] = [
                  ...messages.map((m, i) => ({ id: `msg-${i}`, role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) })),
                  ...(assistantText || assistantReasoning ? [{ id: `msg-${messages.length}`, role: "assistant" as const, content: assistantText, ...(assistantReasoning ? { reasoning: assistantReasoning, ...(effectiveDurationMs ? { reasoningDurationMs: effectiveDurationMs } : {}) } : {}) }] : []),
                ];
                traceRecorder.flushMessages(interim);
              }
              break;
            }

            case "abort":
              traceRecorder?.record("run-abort", "Run aborted");
              send({ type: "abort" });
              break;

            case "error":
              traceRecorder?.record("run-error", String(part.error));
              send({ type: "error", error: String(part.error) });
              break;
          }
        }

        traceRecorder?.record("run-finished", "Run completed");
        if (traceRecorder && assistantText) {
          const finalDurationMs = reasoningDurationMs ?? (reasoningStartedAt ? Date.now() - reasoningStartedAt : undefined);
          const chatMessages: SharedChatMessage[] = [
            ...messages.map((m, i) => ({ id: `msg-${i}`, role: m.role, content: typeof m.content === "string" ? m.content : JSON.stringify(m.content) })),
            { id: `msg-${messages.length}`, role: "assistant" as const, content: assistantText, ...(assistantReasoning ? { reasoning: assistantReasoning, ...(finalDurationMs ? { reasoningDurationMs: finalDurationMs } : {}) } : {}) },
          ];
          traceRecorder.flushMessages(chatMessages);
        }
        send({ type: "done" });
      } catch (err) {
        traceRecorder?.record("run-error", String(err));
        send({ type: "error", error: String(err) });
      } finally {
        clearInterval(keepalive);
        await traceRecorder?.flush();
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
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
