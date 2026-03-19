import {
  NodeRuntime,
  createNodeDriver,
  createNodeRuntimeDriverFactory,
  createInMemoryFileSystem,
  allowAllFs,
  allowAllNetwork,
  allowAllChildProcess,
  type CommandExecutor,
  type VirtualFileSystem,
} from "secure-exec";
import { spawn } from "node:child_process";
import getPort, { portNumbers } from "get-port";
import {
  getWidgetFiles,
  setWidgetFiles,
  getWidget,
  upsertWidget,
} from "@/db/widgets";

// ── Types ──

interface WidgetStatus {
  status: "building" | "ready" | "error";
  port: number;
  startedAt?: number;
}

interface WidgetRuntime {
  runtime: NodeRuntime;
  port: number;
  execPromise?: Promise<unknown>;
}

// ── Per-widget SecureExec runtimes ──

const widgetRuntimes = new Map<string, WidgetRuntime>();
const widgetStatuses = new Map<string, WidgetStatus>();
const buildLocks = new Map<string, Promise<void>>();

const commandExecutor: CommandExecutor = {
  spawn(command, args, options) {
    const resolvedCommand = command === "node" ? process.execPath : command;
    const child = spawn(resolvedCommand, args, {
      cwd: options.cwd ?? undefined,
      env: options.env as NodeJS.ProcessEnv | undefined,
      stdio: ["pipe", "pipe", "pipe"],
    });

    child.stdout!.on("data", (chunk: Buffer) => {
      options.onStdout?.(new Uint8Array(chunk));
    });
    child.stderr!.on("data", (chunk: Buffer) => {
      options.onStderr?.(new Uint8Array(chunk));
    });

    return {
      writeStdin(data: Uint8Array | string) {
        child.stdin!.write(data);
      },
      closeStdin() {
        child.stdin!.end();
      },
      kill(signal?: number) {
        child.kill(signal);
      },
      wait() {
        return new Promise<number>((resolve) => {
          child.once("close", (code: number | null) => resolve(code ?? 1));
        });
      },
    };
  },
};

// ── Template files (embedded from docker/widget-base/template) ──

const TEMPLATE_INDEX_HTML = `<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Widget</title>
  </head>
  <body style="margin:0; background:transparent;">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`;

const TEMPLATE_MAIN_TSX = `import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);`;

const TEMPLATE_INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  height: 100%;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  overflow: hidden;
  background: transparent;
  color: #f4f4f5;
}

#root { width: 100%; height: 100%; }

::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #525252; border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: #737373; }
* { scrollbar-width: thin; scrollbar-color: #525252 transparent; }`;

const TEMPLATE_UTILS_TS = `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}`;

const TEMPLATE_VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  base: "./",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    hmr: false,
  },
});`;

const TEMPLATE_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2020",
    useDefineForClassFields: true,
    lib: ["ES2020", "DOM", "DOM.Iterable"],
    module: "ESNext",
    skipLibCheck: true,
    moduleResolution: "bundler",
    allowImportingTsExtensions: true,
    resolveJsonModule: true,
    isolatedModules: true,
    noEmit: true,
    jsx: "react-jsx",
    strict: true,
    noUnusedLocals: false,
    noUnusedParameters: false,
    noFallthroughCasesInSwitch: true,
    paths: { "@/*": ["./src/*"] },
  },
  include: ["src"],
}, null, 2);

const TEMPLATE_POSTCSS_CONFIG = `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};`;

const TEMPLATE_TAILWIND_CONFIG = `/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};`;

const TEMPLATE_PACKAGE_JSON = JSON.stringify({
  name: "widget",
  private: true,
  version: "0.0.1",
  type: "module",
  scripts: {
    dev: "vite --host 0.0.0.0 --port 3000",
    build: "vite build",
    preview: "vite preview --host 0.0.0.0 --port 3000",
  },
  dependencies: {
    react: "^18.3.1",
    "react-dom": "^18.3.1",
    "class-variance-authority": "^0.7.1",
    clsx: "^2.1.1",
    "tailwind-merge": "^2.5.2",
    "lucide-react": "^0.400.0",
    recharts: "^2.15.0",
    "date-fns": "^4.1.0",
    "maplibre-gl": "^4.7.0",
    "framer-motion": "^11.0.0",
    "@tanstack/react-query": "^5.0.0",
  },
  devDependencies: {
    "@vitejs/plugin-react": "^4.3.1",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "tailwindcss": "^3.4.1",
    autoprefixer: "^10.4.20",
    postcss: "^8.4.40",
    typescript: "^5.5.3",
    vite: "^5.4.1",
  },
}, null, 2);

// ── Security ──

const VALID_PACKAGE_RE = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~>=<| -]+)?$/;

export function sanitizePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  if (normalized.startsWith("/") || normalized.includes("..")) {
    throw new Error(`Invalid path: ${relativePath}`);
  }
  if (!normalized.startsWith("src/")) {
    throw new Error(`Path must be under src/: ${relativePath}`);
  }
  return normalized;
}

export function validatePackages(packages: string[]): void {
  for (const pkg of packages) {
    if (!VALID_PACKAGE_RE.test(pkg)) {
      throw new Error(`Invalid package name: ${pkg}`);
    }
  }
}

// ── File operations (SQLite-backed) ──

export async function writeWidgetFile(
  widgetId: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const safePath = sanitizePath(relativePath);
  const files = getWidgetFiles(widgetId);
  files[safePath] = content;

  const existing = getWidget(widgetId);
  if (existing) {
    setWidgetFiles(widgetId, files);
  } else {
    upsertWidget({
      id: widgetId,
      code: safePath === "src/App.tsx" ? content : null,
      filesJson: JSON.stringify(files),
    });
  }
}

export async function readWidgetFile(
  widgetId: string,
  relativePath: string,
): Promise<string | null> {
  const safePath = sanitizePath(relativePath);
  const files = getWidgetFiles(widgetId);
  return files[safePath] ?? null;
}

export async function listWidgetFiles(widgetId: string): Promise<string[]> {
  return Object.keys(getWidgetFiles(widgetId)).sort();
}

export async function deleteWidgetFile(
  widgetId: string,
  relativePath: string,
): Promise<void> {
  const safePath = sanitizePath(relativePath);
  if (safePath === "src/App.tsx") {
    throw new Error("Cannot delete the entry point App.tsx");
  }
  const files = getWidgetFiles(widgetId);
  delete files[safePath];
  setWidgetFiles(widgetId, files);
}

// ── Dependencies (stored in files map as deps.json) ──

export async function addWidgetDependencies(
  widgetId: string,
  packages: string[],
): Promise<string[]> {
  validatePackages(packages);
  const files = getWidgetFiles(widgetId);
  let existing: string[] = [];
  try {
    if (files["deps.json"]) {
      existing = JSON.parse(files["deps.json"]);
    }
  } catch {
    // ignore
  }
  const merged = [...new Set([...existing, ...packages])];
  files["deps.json"] = JSON.stringify(merged);
  setWidgetFiles(widgetId, files);
  return merged;
}

// ── SecureExec runtime management ──

function createWidgetRuntime(): {
  runtime: NodeRuntime;
  filesystem: VirtualFileSystem;
} {
  const filesystem = createInMemoryFileSystem();
  const runtime = new NodeRuntime({
    systemDriver: createNodeDriver({
      filesystem,
      useDefaultNetwork: true,
      commandExecutor,
      permissions: {
        ...allowAllFs,
        ...allowAllNetwork,
        ...allowAllChildProcess,
      },
    }),
    runtimeDriverFactory: createNodeRuntimeDriverFactory(),
    memoryLimit: 256,
    cpuTimeLimitMs: 120_000,
  });

  return { runtime, filesystem };
}

async function ensureDir(filesystem: VirtualFileSystem, path: string): Promise<void> {
  const parts = path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current += "/" + part;
    const exists = await filesystem.exists(current);
    if (!exists) {
      await filesystem.mkdir(current);
    }
  }
}

async function writeTemplateFiles(
  filesystem: VirtualFileSystem,
  widgetId: string,
  files: Record<string, string>,
): Promise<void> {
  const widgetDir = `/app/widgets/${widgetId}`;

  await ensureDir(filesystem, widgetDir);
  await ensureDir(filesystem, `${widgetDir}/src`);
  await ensureDir(filesystem, `${widgetDir}/src/lib`);
  await ensureDir(filesystem, `${widgetDir}/src/components`);

  await filesystem.writeFile(`${widgetDir}/index.html`, TEMPLATE_INDEX_HTML);
  await filesystem.writeFile(`${widgetDir}/src/main.tsx`, TEMPLATE_MAIN_TSX);
  await filesystem.writeFile(`${widgetDir}/src/index.css`, TEMPLATE_INDEX_CSS);
  await filesystem.writeFile(`${widgetDir}/src/lib/utils.ts`, TEMPLATE_UTILS_TS);
  await filesystem.writeFile(`${widgetDir}/vite.config.ts`, TEMPLATE_VITE_CONFIG);
  await filesystem.writeFile(`${widgetDir}/tsconfig.json`, TEMPLATE_TSCONFIG);
  await filesystem.writeFile(`${widgetDir}/postcss.config.js`, TEMPLATE_POSTCSS_CONFIG);
  await filesystem.writeFile(`${widgetDir}/tailwind.config.ts`, TEMPLATE_TAILWIND_CONFIG);
  await filesystem.writeFile(`${widgetDir}/package.json`, TEMPLATE_PACKAGE_JSON);

  for (const [path, content] of Object.entries(files)) {
    if (path === "deps.json") continue;
    if (path.includes("/")) {
      const dir = `${widgetDir}/${path.substring(0, path.lastIndexOf("/"))}`;
      await ensureDir(filesystem, dir);
    }
    await filesystem.writeFile(`${widgetDir}/${path}`, content);
  }
}

async function doBuild(widgetId: string): Promise<void> {
  const port = await getPort({ port: portNumbers(4100, 4999) });

  widgetStatuses.set(widgetId, { status: "building", port, startedAt: Date.now() });

  try {
    const files = getWidgetFiles(widgetId);
    if (!files["src/App.tsx"]) {
      widgetStatuses.set(widgetId, { status: "error", port });
      console.error(`[secure-exec] No src/App.tsx for ${widgetId}`);
      return;
    }

    const existing = widgetRuntimes.get(widgetId);
    if (existing) {
      try {
        await existing.runtime.terminate();
        existing.runtime.dispose();
      } catch {
        // ignore
      }
      widgetRuntimes.delete(widgetId);
    }

    const { runtime, filesystem } = createWidgetRuntime();
    await writeTemplateFiles(filesystem, widgetId, files);

    const widgetDir = `/app/widgets/${widgetId}`;
    const distDir = `/app/dist/${widgetId}`;

    let depsInstallCode = "";
    if (files["deps.json"]) {
      try {
        const deps: string[] = JSON.parse(files["deps.json"]);
        if (deps.length > 0) {
          depsInstallCode = `
        execSync("npm install --no-save ${deps.join(" ")}", { cwd: widgetDir, stdio: "pipe" });`;
        }
      } catch {
        // ignore
      }
    }

    const buildScript = `
      const { execSync } = require("child_process");

      const widgetDir = ${JSON.stringify(widgetDir)};
      const distDir = ${JSON.stringify(distDir)};

      try {
        execSync("npm install", { cwd: widgetDir, stdio: "pipe" });
        ${depsInstallCode}
        execSync("npx vite build --outDir " + distDir, { cwd: widgetDir, stdio: "pipe" });
        console.log("BUILD_SUCCESS");
      } catch (err) {
        console.error("BUILD_FAILED: " + (err.stderr ? err.stderr.toString() : err.message));
        process.exitCode = 1;
      }
    `;

    const logs: string[] = [];
    const buildResult = await runtime.exec(buildScript, {
      onStdio: (event) => {
        logs.push(`[${event.channel}] ${event.message}`);
      },
    });

    if (buildResult.code !== 0 || !logs.some(l => l.includes("BUILD_SUCCESS"))) {
      console.error(`[secure-exec] Build failed for ${widgetId}:`, logs.join("\n"));
      widgetStatuses.set(widgetId, { status: "error", port });
      runtime.dispose();
      return;
    }

    await ensureDir(filesystem, distDir);

    const serverScript = `
      (async () => {
        const http = require("node:http");
        const fs = require("node:fs");
        const path = require("node:path");

        const distDir = ${JSON.stringify(distDir)};
        const port = ${port};
        const host = "127.0.0.1";

        const mimeTypes = {
          ".html": "text/html; charset=utf-8",
          ".js": "application/javascript; charset=utf-8",
          ".mjs": "application/javascript; charset=utf-8",
          ".css": "text/css; charset=utf-8",
          ".json": "application/json; charset=utf-8",
          ".png": "image/png",
          ".jpg": "image/jpeg",
          ".jpeg": "image/jpeg",
          ".gif": "image/gif",
          ".svg": "image/svg+xml",
          ".ico": "image/x-icon",
          ".woff": "font/woff",
          ".woff2": "font/woff2",
          ".ttf": "font/ttf",
          ".eot": "font/eot",
        };

        function getMime(filePath) {
          const ext = path.extname(filePath).toLowerCase();
          return mimeTypes[ext] || "application/octet-stream";
        }

        const server = http.createServer((req, res) => {
          let urlPath = new URL(req.url, "http://localhost").pathname;
          if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

          const filePath = path.join(distDir, urlPath);

          try {
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
              const content = fs.readFileSync(filePath);
              res.writeHead(200, {
                "Content-Type": getMime(filePath),
                "Cache-Control": "no-store",
              });
              res.end(content);
            } else {
              const indexPath = path.join(distDir, "index.html");
              if (fs.existsSync(indexPath)) {
                const content = fs.readFileSync(indexPath);
                res.writeHead(200, {
                  "Content-Type": "text/html; charset=utf-8",
                  "Cache-Control": "no-store",
                });
                res.end(content);
              } else {
                res.writeHead(404);
                res.end("Not Found");
              }
            }
          } catch (err) {
            res.writeHead(500);
            res.end("Internal Server Error");
          }
        });

        await new Promise((resolve, reject) => {
          server.once("error", reject);
          server.listen(port, host, resolve);
        });

        console.log("SERVER_LISTENING:" + port);
        await new Promise(() => {});
      })().catch((error) => {
        console.error("SERVER_ERROR:", error.message || error);
        process.exitCode = 1;
      });
    `;

    const execPromise = runtime.exec(serverScript, {
      onStdio: (event) => {
        if (event.message.includes("SERVER_LISTENING")) {
          console.log(`[secure-exec] Widget ${widgetId} server listening on port ${port}`);
        }
      },
    });

    await waitForServer(runtime, `http://127.0.0.1:${port}/`, 15000);

    widgetRuntimes.set(widgetId, { runtime, port, execPromise });
    widgetStatuses.set(widgetId, { status: "ready", port });
    console.log(`[secure-exec] Widget ${widgetId} built and serving on port ${port}`);
  } catch (err) {
    console.error(`[secure-exec] Build error for ${widgetId}:`, err);
    widgetStatuses.set(widgetId, { status: "error", port });
  }
}

async function waitForServer(
  runtime: NodeRuntime,
  url: string,
  timeout = 15000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const response = await runtime.network.fetch(url, { method: "GET" });
      if (response.status === 200 || response.status === 404) {
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Timed out waiting for server at ${url}`);
}

// ── Public API ──

export async function buildWidget(widgetId: string): Promise<void> {
  const existing = buildLocks.get(widgetId);
  if (existing) await existing;

  const promise = doBuild(widgetId);
  buildLocks.set(widgetId, promise);
  try {
    await promise;
  } finally {
    buildLocks.delete(widgetId);
  }
}

const BUILD_TIMEOUT_MS = 120_000;

export async function ensureWidget(widgetId: string): Promise<WidgetStatus> {
  const existing = widgetStatuses.get(widgetId);
  if (existing && existing.status === "ready") {
    const wr = widgetRuntimes.get(widgetId);
    if (wr) return existing;
  }

  const isStaleBuilding =
    existing?.status === "building" &&
    existing.startedAt &&
    Date.now() - existing.startedAt > BUILD_TIMEOUT_MS;

  if (existing?.status === "building" && !isStaleBuilding) {
    return existing;
  }

  const port = await getPort({ port: portNumbers(4100, 4999) });
  const status: WidgetStatus = { status: "building", port, startedAt: Date.now() };
  widgetStatuses.set(widgetId, status);
  buildWidget(widgetId).catch((err) => {
    console.error(`[secure-exec] Background build failed for ${widgetId}:`, err);
  });
  return status;
}

export async function rebuildWidget(widgetId: string): Promise<WidgetStatus> {
  const port = await getPort({ port: portNumbers(4100, 4999) });
  const status: WidgetStatus = { status: "building", port };
  widgetStatuses.set(widgetId, status);

  buildWidget(widgetId).catch((err) => {
    console.error(`[secure-exec] Rebuild failed for ${widgetId}:`, err);
  });

  return status;
}

export async function stopWidget(widgetId: string): Promise<void> {
  widgetStatuses.delete(widgetId);
  const wr = widgetRuntimes.get(widgetId);
  if (wr) {
    try {
      await wr.runtime.terminate();
      wr.runtime.dispose();
    } catch {
      // ignore
    }
    widgetRuntimes.delete(widgetId);
  }
}

export function getWidgetStatus(widgetId: string): WidgetStatus | null {
  return widgetStatuses.get(widgetId) ?? null;
}

export function getWidgetRuntime(widgetId: string): WidgetRuntime | null {
  return widgetRuntimes.get(widgetId) ?? null;
}

export async function fetchFromWidget(
  widgetId: string,
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string; contentType: string } | null> {
  const wr = widgetRuntimes.get(widgetId);
  if (!wr) return null;

  try {
    const url = `http://127.0.0.1:${wr.port}/${path}`;
    const response = await wr.runtime.network.fetch(url, {
      method: "GET",
      headers,
    });

    return {
      status: response.status,
      body: response.body,
      contentType: response.headers?.["content-type"] ?? "text/html",
    };
  } catch {
    return null;
  }
}
