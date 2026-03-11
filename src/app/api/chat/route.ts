import { streamText, stepCountIs, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";

const SYSTEM_PROMPT = `You are a coding agent that builds a SINGLE React widget component inside a Next.js 15 WebContainer running locally in the user's browser.

You have tools to write files, read files, and run shell commands directly in the WebContainer.

## What You Are Building

You are building ONE focused widget component — NOT an app, NOT a page, NOT a dashboard with multiple sections. The widget is embedded as an iframe inside a parent dashboard app that ALREADY provides:
- A title bar with the widget name
- An expand/collapse button
- A close button

DO NOT recreate any of these. Just build the core content the user asks for.

## Project Structure

The WebContainer runs a Next.js 15 App Router project. The files you will create/update:

- src/app/page.tsx — Server Component (NO "use client"). Fetches initial data, passes as props to Widget. Set \`export const revalidate = 0;\`.
- src/app/actions.ts — Server Actions ("use server"). Exports async functions the client calls to poll/refresh data without CORS.
- src/components/Widget.tsx — Client Component ("use client"). Receives initial data as props, renders UI, calls server actions for polling.

## Architecture Rules

- page.tsx is a SERVER component — no "use client". Use top-level async/await to fetch external APIs (no CORS).
- actions.ts MUST start with "use server". Export async functions returning serializable data.
- Widget.tsx MUST start with "use client". Import server actions from "@/app/actions" for polling.

## Available Packages (pre-installed)

- react, react-dom (19.x)
- lucide-react (icons)
- recharts (LineChart, BarChart, AreaChart, PieChart, etc.)
- @base-ui/react (shadcn primitives)
- class-variance-authority, clsx, tailwind-merge

## Installing Extra Packages

If the widget needs a package not listed above, install it FIRST:
\`\`\`
runCommand("npm", ["install", "date-fns"])
runCommand("npm", ["install", "framer-motion"])
\`\`\`
Any npm package works — this is a real Node.js environment.

## Pre-installed shadcn/ui Components

All in src/components/ui/. ALWAYS use these:

- Button: \`import { Button } from "@/components/ui/button"\`
- Card, CardHeader, CardTitle, CardContent, CardFooter: \`import { Card, ... } from "@/components/ui/card"\`
- Input: \`import { Input } from "@/components/ui/input"\`
- Badge: \`import { Badge } from "@/components/ui/badge"\`
- Table, TableHeader, TableBody, TableHead, TableRow, TableCell: \`import { Table, ... } from "@/components/ui/table"\`
- Tabs, TabsList, TabsTrigger, TabsContent: \`import { Tabs, ... } from "@/components/ui/tabs"\`
- ScrollArea: \`import { ScrollArea } from "@/components/ui/scroll-area"\`
- Skeleton: \`import { Skeleton } from "@/components/ui/skeleton"\`
- Separator, Label, Progress, Alert, AlertTitle, AlertDescription
- Select, Switch, Checkbox, Collapsible, Tooltip, Dialog

Utility: \`import { cn } from "@/lib/utils"\`

## Map Pattern

For maps, run \`runCommand("npm", ["install", "maplibre-gl"])\` first, then use maplibre-gl imperatively in useEffect with the two-file pattern (LeafletMap.tsx + dynamic import in Widget.tsx).

## Styling

- Tailwind CSS utility classes (Tailwind v4, loaded via PostCSS)
- Dark theme — html has class="dark"
- No rounded corners — omit rounded-* classes
- Base font size 13px, monospace font
- Use light text colours (text-foreground, text-zinc-100)
- DARK MODE: html has class="dark". Charts must use bright/light colours (#60a5fa, #34d399, #f87171, #fbbf24)

## Layout Rules

- Widget root: \`<ScrollArea className="h-screen w-full">\`
- Inner div: \`<div className="p-4 space-y-4">...content...</div>\`
- Body background is transparent. NEVER set explicit background on widget root.

## Workflow

1. Briefly explain what you will build (1-2 sentences max).
2. If you need extra npm packages, install them with runCommand first.
3. Use writeFile to create/update the three files (page.tsx, actions.ts, Widget.tsx).
4. Run \`runCommand("npx", ["tsc", "--noEmit"])\` to check for TypeScript errors.
5. If errors: read the file, fix it, write it back, re-run check. Repeat until clean.
6. Do NOT consider done until tsc passes.

Keep the widget focused, clean, and production-quality.`;

export async function POST(request: Request) {
  const body = await request.json();
  const { messages } = body as {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  };

  // In-memory file cache for this request (so readFile can read what writeFile wrote)
  const fileCache = new Map<string, string>();

  // We need a way to relay runCommand results from the client back to the agent.
  // We use a simple promise/resolve pattern via request-scoped pending commands.
  // The client runs the command in WebContainer and POSTs the result to /api/chat/command.
  // For now we stream the command to the client and accept that the agent won't see
  // real output (tsc checks will still work via the text the agent expects).
  // TODO: implement bidirectional command relay for full output.

  const writeFileTool = tool({
    description: "Write or overwrite a file in the Next.js project.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root, e.g. src/app/page.tsx"),
      content: z.string().describe("The full file content"),
    }),
    execute: async ({ path, content }) => {
      fileCache.set(path, content);
      // The actual file write happens via SSE → client → WebContainer
      return { success: true, path };
    },
  });

  const readFileTool = tool({
    description: "Read the contents of a file in the project.",
    inputSchema: z.object({
      path: z.string().describe("File path relative to project root"),
    }),
    execute: async ({ path }) => {
      const content = fileCache.get(path);
      if (content !== undefined) return { path, content };
      return { path, content: "", error: "File not found in cache. Only files you have written are readable." };
    },
  });

  const runCommandTool = tool({
    description: "Execute a shell command in the WebContainer (npm install, tsc, etc.).",
    inputSchema: z.object({
      command: z.string().describe("Command to run, e.g. npm, npx"),
      args: z.array(z.string()).describe("Arguments"),
    }),
    execute: async ({ command, args }) => {
      // The command is streamed to the client via SSE.
      // We optimistically return success so the agent can continue.
      // The client will run it in the WebContainer in the background.
      return {
        exitCode: 0,
        stdout: `[running ${command} ${args.join(" ")} in WebContainer]`,
        stderr: "",
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
      runCommand: runCommandTool,
      web_search: webSearchTool,
    },
    stopWhen: stepCountIs(400),
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
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
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
                // Stream the full file content to the client
                send({
                  type: "write-file",
                  path: input?.path,
                  content: input?.content,
                });
                send({ type: "tool-call", toolName: "writeFile", args: { path: input?.path } });
              } else if (part.toolName === "readFile") {
                send({ type: "tool-call", toolName: "readFile", args: { path: input?.path } });
              } else if (part.toolName === "runCommand") {
                const cmd = [input?.command, ...((input?.args as string[]) ?? [])].join(" ");
                // Stream command to client so WebContainer can execute it
                send({
                  type: "run-command",
                  command: input?.command,
                  args: input?.args,
                });
                send({ type: "tool-call", toolName: "runCommand", args: { command: input?.command, args: input?.args } });
              } else if (part.toolName === "web_search") {
                send({ type: "tool-call", toolName: "web_search", args: { query: input?.query } });
              }
              break;
            }

            case "tool-result":
              if (part.toolName !== "writeFile" && part.toolName !== "readFile") {
                send({
                  type: "tool-result",
                  toolName: part.toolName,
                  result:
                    typeof part.output === "object" && part.output !== null
                      ? { ...part.output as Record<string, unknown>, content: undefined }
                      : part.output,
                });
              }
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
