import { execSync } from "child_process";
import * as path from "path";
import * as fs from "fs";
import {
  getWidgetFiles,
  setWidgetFiles,
  getWidget,
  upsertWidget,
} from "@/db/widgets";

// ── Config ──

const DATA_DIR = path.join(process.cwd(), "data");
const TEMPLATE_DIR = path.join(process.cwd(), "widget-template");
const WORKSPACE_DIR = process.env.WIDGET_WORKSPACE_PATH
  || path.join(DATA_DIR, "widget-workspace");
const BUILDS_DIR = path.join(DATA_DIR, "widget-builds");
const DIST_DIR = path.join(DATA_DIR, "widgets-dist");

const MAX_CONCURRENT_BUILDS = 4;

// ── Types ──

interface WidgetStatus {
  status: "building" | "ready" | "error";
  error?: string;
}

// ── Build state ──

const buildLocks = new Map<string, Promise<void>>();
const widgetStatuses = new Map<string, WidgetStatus & { startedAt?: number }>();
let activeBuildCount = 0;
const buildQueue: Array<{
  widgetId: string;
  resolve: () => void;
  reject: (err: Error) => void;
}> = [];

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

// ── Workspace initialization ──

let workspaceReady = false;

const SHADCN_COMPONENTS = [
  "button", "card", "badge", "input", "table", "tabs", "scroll-area",
  "skeleton", "separator", "progress", "alert", "avatar", "checkbox",
  "dialog", "dropdown-menu", "label", "popover", "radio-group", "select",
  "sheet", "slider", "switch", "textarea", "toggle", "tooltip",
  "accordion", "collapsible", "command", "context-menu", "hover-card",
  "menubar", "navigation-menu", "pagination", "resizable", "sonner",
];

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensureWorkspace(): void {
  if (workspaceReady) return;

  const needsInit = !fs.existsSync(path.join(WORKSPACE_DIR, "node_modules"));

  if (needsInit) {
    console.log("[widget-builder] Initializing widget workspace from template...");

    // Copy template files to workspace
    fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
    copyDirSync(TEMPLATE_DIR, WORKSPACE_DIR);

    // Install dependencies
    console.log("[widget-builder] Installing workspace dependencies...");
    execSync("npm install", {
      cwd: WORKSPACE_DIR,
      stdio: "pipe",
      timeout: 120_000,
    });

    // Install shadcn components
    const componentsDir = path.join(WORKSPACE_DIR, "src", "components", "ui");
    if (!fs.existsSync(componentsDir) || fs.readdirSync(componentsDir).length === 0) {
      console.log("[widget-builder] Installing shadcn components...");
      execSync(
        `npx shadcn@latest add --yes ${SHADCN_COMPONENTS.join(" ")}`,
        {
          cwd: WORKSPACE_DIR,
          stdio: "pipe",
          timeout: 120_000,
        },
      );
    }

    console.log("[widget-builder] Workspace initialized");
  }

  fs.mkdirSync(BUILDS_DIR, { recursive: true });
  fs.mkdirSync(DIST_DIR, { recursive: true });

  workspaceReady = true;
}

// ── Per-widget build directory setup ──

function prepareBuildDir(widgetId: string, files: Record<string, string>): string {
  const buildDir = path.join(BUILDS_DIR, widgetId);

  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true, force: true });
  }
  fs.mkdirSync(buildDir, { recursive: true });

  // Symlink node_modules from workspace
  fs.symlinkSync(
    path.join(WORKSPACE_DIR, "node_modules"),
    path.join(buildDir, "node_modules"),
    "junction",
  );

  // Copy config files from workspace
  for (const cfg of [
    "vite.config.ts",
    "tailwind.config.ts",
    "postcss.config.js",
    "tsconfig.json",
    "index.html",
  ]) {
    fs.copyFileSync(
      path.join(WORKSPACE_DIR, cfg),
      path.join(buildDir, cfg),
    );
  }

  // Copy shared source files
  const srcDir = path.join(buildDir, "src");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.copyFileSync(
    path.join(WORKSPACE_DIR, "src", "index.css"),
    path.join(srcDir, "index.css"),
  );
  fs.copyFileSync(
    path.join(WORKSPACE_DIR, "src", "main.tsx"),
    path.join(srcDir, "main.tsx"),
  );

  // Copy lib/utils.ts
  const libDir = path.join(srcDir, "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.copyFileSync(
    path.join(WORKSPACE_DIR, "src", "lib", "utils.ts"),
    path.join(srcDir, "lib", "utils.ts"),
  );

  // Create components dir and symlink only the shadcn ui/ subdirectory
  const buildComponents = path.join(srcDir, "components");
  fs.mkdirSync(buildComponents, { recursive: true });
  const workspaceUi = path.join(WORKSPACE_DIR, "src", "components", "ui");
  const buildUi = path.join(buildComponents, "ui");
  if (fs.existsSync(workspaceUi)) {
    fs.symlinkSync(workspaceUi, buildUi, "junction");
  }

  // Write widget source files from SQLite
  for (const [filePath, content] of Object.entries(files)) {
    if (filePath === "deps.json") continue;

    // Skip shadcn ui components — they're symlinked from workspace
    if (filePath.startsWith("src/components/ui/")) continue;

    const fullPath = path.join(buildDir, filePath);
    const dir = path.dirname(fullPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content, "utf-8");
  }

  return buildDir;
}

function cleanupBuildDir(widgetId: string): void {
  const buildDir = path.join(BUILDS_DIR, widgetId);
  try {
    fs.rmSync(buildDir, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

// ── Concurrency control ──

function acquireBuildSlot(): Promise<void> {
  if (activeBuildCount < MAX_CONCURRENT_BUILDS) {
    activeBuildCount++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    buildQueue.push({ widgetId: "", resolve, reject });
  });
}

function releaseBuildSlot(): void {
  activeBuildCount--;
  const next = buildQueue.shift();
  if (next) {
    activeBuildCount++;
    next.resolve();
  }
}

// ── Build a widget with Vite ──

const BUILD_TIMEOUT_MS = 30_000;

async function doBuild(widgetId: string): Promise<void> {
  const startTime = Date.now();
  widgetStatuses.set(widgetId, { status: "building", startedAt: startTime });

  await acquireBuildSlot();

  try {
    ensureWorkspace();

    const files = getWidgetFiles(widgetId);
    if (!files["src/App.tsx"]) {
      widgetStatuses.set(widgetId, { status: "error", error: "No src/App.tsx found" });
      console.error(`[widget-builder] No src/App.tsx for ${widgetId}`);
      return;
    }

    // Install extra dependencies if any
    let extraDeps: string[] = [];
    try {
      if (files["deps.json"]) {
        extraDeps = JSON.parse(files["deps.json"]);
      }
    } catch {
      // ignore
    }

    if (extraDeps.length > 0) {
      const missing = extraDeps.filter(
        (dep) => !fs.existsSync(path.join(WORKSPACE_DIR, "node_modules", dep)),
      );
      if (missing.length > 0) {
        console.log(`[widget-builder] Installing extra deps: ${missing.join(", ")}`);
        execSync(`npm install --no-save ${missing.join(" ")}`, {
          cwd: WORKSPACE_DIR,
          stdio: "pipe",
          timeout: 30_000,
        });
      }
    }

    const buildDir = prepareBuildDir(widgetId, files);
    const outDir = path.join(DIST_DIR, widgetId);

    try {
      execSync(
        `npx vite build --outDir ${JSON.stringify(outDir)} --emptyOutDir`,
        {
          cwd: buildDir,
          stdio: "pipe",
          timeout: BUILD_TIMEOUT_MS,
          env: { ...process.env, NODE_ENV: "production" },
        },
      );
    } catch (buildErr) {
      const output = buildErr instanceof Error && "stderr" in buildErr
        ? String((buildErr as NodeJS.ErrnoException & { stderr?: Buffer }).stderr)
        : String(buildErr);
      console.error(`[widget-builder] Build failed for ${widgetId}:`, output);
      widgetStatuses.set(widgetId, { status: "error", error: output });
      return;
    } finally {
      cleanupBuildDir(widgetId);
    }

    // Patch the built index.html with <base> tag for correct asset paths
    const indexPath = path.join(outDir, "index.html");
    if (fs.existsSync(indexPath)) {
      let html = fs.readFileSync(indexPath, "utf-8");
      html = html.replace("<head>", `<head><base href="/api/widget/${widgetId}/">`);
      fs.writeFileSync(indexPath, html, "utf-8");
    }

    const elapsed = Date.now() - startTime;
    console.log(`[widget-builder] Widget ${widgetId} built in ${elapsed}ms`);
    widgetStatuses.set(widgetId, { status: "ready" });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[widget-builder] Build error for ${widgetId}:`, err);
    widgetStatuses.set(widgetId, { status: "error", error: errorMsg });
  } finally {
    releaseBuildSlot();
  }
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

export async function ensureWidget(widgetId: string): Promise<WidgetStatus> {
  const existing = widgetStatuses.get(widgetId);
  if (existing && existing.status === "ready") {
    const indexPath = path.join(DIST_DIR, widgetId, "index.html");
    if (fs.existsSync(indexPath)) {
      return existing;
    }
  }

  const isStaleBuilding =
    existing?.status === "building" &&
    existing.startedAt &&
    Date.now() - existing.startedAt > BUILD_TIMEOUT_MS;

  if (existing?.status === "building" && !isStaleBuilding) {
    return existing;
  }

  // Check if already built on disk
  const indexPath = path.join(DIST_DIR, widgetId, "index.html");
  if (fs.existsSync(indexPath)) {
    const status: WidgetStatus = { status: "ready" };
    widgetStatuses.set(widgetId, status);
    return status;
  }

  const status: WidgetStatus & { startedAt: number } = {
    status: "building",
    startedAt: Date.now(),
  };
  widgetStatuses.set(widgetId, status);
  buildWidget(widgetId).catch((err) => {
    console.error(`[widget-builder] Background build failed for ${widgetId}:`, err);
  });
  return status;
}

export async function rebuildWidget(widgetId: string): Promise<WidgetStatus> {
  const status: WidgetStatus = { status: "building" };
  widgetStatuses.set(widgetId, { ...status, startedAt: Date.now() });

  buildWidget(widgetId).catch((err) => {
    console.error(`[widget-builder] Rebuild failed for ${widgetId}:`, err);
  });

  return status;
}

export function getWidgetStatus(widgetId: string): WidgetStatus | null {
  return widgetStatuses.get(widgetId) ?? null;
}

export function getWidgetDistPath(widgetId: string, subPath?: string): string {
  if (subPath) {
    return path.join(DIST_DIR, widgetId, subPath);
  }
  return path.join(DIST_DIR, widgetId);
}
