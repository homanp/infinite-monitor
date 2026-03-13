import { streamText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { Bash } from "just-bash";
import {
  writeWidgetFile,
  readWidgetFile,
  listWidgetFiles,
  deleteWidgetFile,
  addWidgetDependencies,
  rebuildWidget,
} from "@/lib/widget-runner";
import {
  getAllDashboards,
  getWidget,
  getWidgetFiles,
} from "@/db/widgets";

const SYSTEM_PROMPT = `You are a coding agent that builds React widget components.

The widget runs in a Vite + React environment inside a Docker container. You can create multiple files under \`src/\` and install additional npm packages.

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

All paths passed to tools must start with \`src/\`.

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

## Adding Extra Dependencies

If you need a package that is NOT listed above, call \`addDependencies\` BEFORE writing code that imports it. The packages will be installed when the container builds.

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
2. If extra packages are needed, call \`addDependencies\` first.
3. Write helper files first (\`writeFile\` for components, hooks, utils).
4. Write \`src/App.tsx\` LAST — this triggers the container build.
5. Use \`listFiles\` and \`readFile\` to inspect existing code when iterating.
6. If you spot issues, fix the affected files and write \`src/App.tsx\` again to rebuild.

## Dashboard Awareness

You are building one widget within a larger dashboard. Use \`listDashboardWidgets\` to see what other widgets exist — their titles, descriptions, and whether they have code. Use \`readWidgetCode\` to inspect a sibling widget's source code when you need to match API patterns, data formats, or styling conventions.

Design your widget to complement the others. Don't duplicate what they already show.

## Bash Tool

You have access to a sandboxed \`bash\` tool for running shell commands. The environment is in-memory with no access to the real filesystem. Use it for:
- Processing or transforming data (jq, awk, sed, grep, sort, etc.)
- Quick calculations or logic
- Prototyping API responses before writing widget code

JavaScript execution is enabled via \`js-exec\`.

Keep the widget focused, clean, and production-quality.`;

export async function POST(request: Request) {
  const body = await request.json();
  const { messages, widgetId } = body as {
    messages: Array<{
      role: "user" | "assistant";
      content: string | Array<Record<string, unknown>>;
    }>;
    widgetId: string;
  };

  if (!widgetId) {
    return Response.json({ error: "widgetId required" }, { status: 400 });
  }

  const writeFileTool = tool({
    description:
      "Write a file to the widget. Path must start with src/. Writing src/App.tsx triggers a container rebuild.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("Relative file path starting with src/ (e.g. src/App.tsx, src/components/Chart.tsx)"),
      content: z.string().describe("The complete file content"),
    }),
    execute: async ({ path, content }) => {
      await writeWidgetFile(widgetId, path, content);
      if (path === "src/App.tsx") {
        rebuildWidget(widgetId).catch(console.error);
      }
      return { success: true, path };
    },
  });

  const readFileTool = tool({
    description: "Read a file from the widget source.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("Relative file path starting with src/"),
    }),
    execute: async ({ path }) => {
      const content = await readWidgetFile(widgetId, path);
      if (content === null) return { error: "File not found", path };
      return { content, path };
    },
  });

  const listFilesTool = tool({
    description:
      "List all files in the widget's src/ directory.",
    inputSchema: z.object({}),
    execute: async () => {
      const files = await listWidgetFiles(widgetId);
      return { files };
    },
  });

  const deleteFileTool = tool({
    description:
      "Delete a file from the widget. Cannot delete src/App.tsx.",
    inputSchema: z.object({
      path: z
        .string()
        .describe("Relative file path starting with src/"),
    }),
    execute: async ({ path }) => {
      await deleteWidgetFile(widgetId, path);
      return { success: true, path };
    },
  });

  const addDependenciesTool = tool({
    description:
      "Install additional npm packages for this widget. Call BEFORE writing code that imports them.",
    inputSchema: z.object({
      packages: z
        .array(z.string())
        .describe("Package names to install (e.g. [\"three\", \"@react-three/fiber\"])"),
    }),
    execute: async ({ packages }) => {
      const all = await addWidgetDependencies(widgetId, packages);
      return { installed: all };
    },
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

  const bashEnv = new Bash({ javascript: true });

  const bashTool = tool({
    description:
      "Run a shell command in a sandboxed bash environment. The environment has an in-memory filesystem, supports standard Unix commands (grep, sed, awk, jq, sort, etc.), and JavaScript via js-exec. Use for data processing, prototyping, and quick calculations.",
    inputSchema: z.object({
      command: z.string().describe("The bash command to execute"),
    }),
    execute: async ({ command }) => {
      const result = await bashEnv.exec(command);
      return {
        stdout: result.stdout.slice(0, 30000),
        stderr: result.stderr.slice(0, 10000),
        exitCode: result.exitCode,
      };
    },
  });

  const webSearchTool = anthropic.tools.webSearch_20250305({ maxUses: 5 });

  const result = streamText({
    model: anthropic("claude-opus-4-6"),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      writeFile: writeFileTool,
      readFile: readFileTool,
      listFiles: listFilesTool,
      deleteFile: deleteFileTool,
      addDependencies: addDependenciesTool,
      listDashboardWidgets: listDashboardWidgetsTool,
      readWidgetCode: readWidgetCodeTool,
      bash: bashTool,
      web_search: webSearchTool,
    },
    stopWhen: stepCountIs(40),
    abortSignal: request.signal,
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "high",
      },
    },
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
              } else if (part.toolName === "listFiles") {
                send({
                  type: "tool-call",
                  toolName: "listFiles",
                  args: {},
                });
              } else if (part.toolName === "deleteFile") {
                send({
                  type: "tool-call",
                  toolName: "deleteFile",
                  args: { path: input?.path },
                });
              } else if (part.toolName === "addDependencies") {
                send({
                  type: "tool-call",
                  toolName: "addDependencies",
                  args: { packages: input?.packages },
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
              } else if (part.toolName === "bash") {
                send({
                  type: "tool-call",
                  toolName: "bash",
                  args: { command: input?.command },
                });
              } else if (part.toolName === "web_search") {
                send({
                  type: "tool-call",
                  toolName: "web_search",
                  args: { query: input?.query },
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
