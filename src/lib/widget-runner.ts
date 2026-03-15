import Docker from "dockerode";
import getPort, { portNumbers } from "get-port";
import {
  getWidgetFiles,
  setWidgetFiles,
  getWidget,
  upsertWidget,
} from "@/db/widgets";

const docker = new Docker();

const IMAGE_NAME = "widget-base:latest";
const CONTAINER_NAME = "widget-runtime";

// ── Types ──

interface WidgetStatus {
  status: "building" | "ready" | "error";
  port: number;
  startedAt?: number;
}

// ── Singleton runtime container ──

let runtimePort: number | null = null;
let runtimeContainerId: string | null = null;
let runtimeStarting: Promise<number> | null = null;

const DIST_VOLUME = "widget-dist";

async function ensureVolume(): Promise<void> {
  try {
    await docker.getVolume(DIST_VOLUME).inspect();
  } catch {
    await docker.createVolume({ Name: DIST_VOLUME });
  }
}

async function ensureRuntime(): Promise<number> {
  if (runtimePort && runtimeContainerId) {
    try {
      const c = docker.getContainer(runtimeContainerId);
      const info = await c.inspect();
      if (info.State.Running) return runtimePort;
    } catch {
      // Inspect failed — try to reattach by name before recreating
    }
    runtimePort = null;
    runtimeContainerId = null;
  }

  // Try to reattach to an existing container by name
  try {
    const existing = docker.getContainer(CONTAINER_NAME);
    const info = await existing.inspect();
    if (info.State.Running) {
      const hostPort = info.NetworkSettings?.Ports?.["3000/tcp"]?.[0]?.HostPort;
      if (hostPort) {
        runtimeContainerId = info.Id;
        runtimePort = parseInt(hostPort, 10);
        return runtimePort;
      }
    } else {
      await existing.remove({ force: true }).catch(() => {});
    }
  } catch {
    // Container doesn't exist
  }

  if (runtimeStarting) return runtimeStarting;

  runtimeStarting = (async () => {
    await ensureVolume();

    const port = await getPort({ port: portNumbers(3100, 3999) });

    const container = await docker.createContainer({
      Image: IMAGE_NAME,
      name: CONTAINER_NAME,
      ExposedPorts: { "3000/tcp": {} },
      HostConfig: {
        PortBindings: {
          "3000/tcp": [{ HostPort: String(port) }],
        },
        Binds: [`${DIST_VOLUME}:/app/dist`],
      },
    });

    await container.start();
    runtimeContainerId = container.id;
    runtimePort = port;

    await waitForReady(port, 30000);
    console.log(`[widget-runtime] Container started on port ${port}`);

    runtimeStarting = null;
    return port;
  })();

  try {
    return await runtimeStarting;
  } catch (err) {
    runtimeStarting = null;
    throw err;
  }
}

// ── Exec helper ──

async function execInRuntime(cmd: string): Promise<{ exitCode: number; output: string }> {
  await ensureRuntime();
  const container = docker.getContainer(runtimeContainerId!);

  const exec = await container.exec({
    Cmd: ["sh", "-c", cmd],
    AttachStdout: true,
    AttachStderr: true,
  });

  return new Promise((resolve, reject) => {
    exec.start({ hijack: true, stdin: false }, (err: Error | null, stream: NodeJS.ReadableStream | undefined) => {
      if (err) return reject(err);
      if (!stream) return reject(new Error("No stream from exec"));

      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        exec.inspect().then((info) => {
          resolve({
            exitCode: info.ExitCode ?? 0,
            output: Buffer.concat(chunks).toString("utf-8"),
          });
        }).catch(reject);
      });
      stream.on("error", reject);
    });
  });
}

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

// ── Build mutex ──

const buildLocks = new Map<string, Promise<void>>();
const widgetStatuses = new Map<string, WidgetStatus>();

// ── Build a widget inside the runtime container ──

async function doBuild(widgetId: string): Promise<void> {
  const port = await ensureRuntime();
  const container = docker.getContainer(runtimeContainerId!);

  widgetStatuses.set(widgetId, { status: "building", port });

  try {
    const files = getWidgetFiles(widgetId);
    if (!files["src/App.tsx"]) {
      widgetStatuses.set(widgetId, { status: "error", port });
      console.error(`[widget-runtime] No src/App.tsx for ${widgetId}`);
      return;
    }

    // Inject files via tar archive
    const tarStream = createTarFromFiles(widgetId, files);
    await container.putArchive(tarStream, { path: "/app/widgets/" });

    // Set up workspace and build
    const depsInstall = files["deps.json"]
      ? `cd /app/widgets/${widgetId} && npm install --no-save $(node -e "process.stdout.write(JSON.parse(require('fs').readFileSync('deps.json','utf8')).join(' '))") 2>/dev/null || true`
      : "true";

    const buildCmd = [
      `mkdir -p /app/widgets/${widgetId}/src /app/dist/${widgetId}`,
      `cp /base/vite.config.ts /base/tsconfig.json /base/postcss.config.js /base/tailwind.config.ts /base/index.html /base/package.json /app/widgets/${widgetId}/`,
      `ln -sf /base/node_modules /app/widgets/${widgetId}/node_modules`,
      `test -d /base/src/components && cp -r /base/src/components /app/widgets/${widgetId}/src/ || true`,
      `test -d /base/src/lib && cp -r /base/src/lib /app/widgets/${widgetId}/src/ || true`,
      `cp /base/src/index.css /app/widgets/${widgetId}/src/index.css`,
      `cp /base/src/main.tsx /app/widgets/${widgetId}/src/main.tsx`,
      depsInstall,
      `cd /app/widgets/${widgetId} && npx vite build --outDir /app/dist/${widgetId} 2>&1`,
    ].join(" && ");

    const result = await execInRuntime(buildCmd);

    if (result.exitCode !== 0) {
      console.error(`[widget-runtime] Build failed for ${widgetId}:`, result.output);
      widgetStatuses.set(widgetId, { status: "error", port });
      return;
    }

    console.log(`[widget-runtime] Widget ${widgetId} built successfully`);
    widgetStatuses.set(widgetId, { status: "ready", port });
  } catch (err) {
    console.error(`[widget-runtime] Build error for ${widgetId}:`, err);
    widgetStatuses.set(widgetId, { status: "error", port });
  }
}

function createTarFromFiles(widgetId: string, files: Record<string, string>): Buffer {
  // Simple tar implementation without external deps
  const entries: Buffer[] = [];

  for (const [filePath, content] of Object.entries(files)) {
    if (filePath === "deps.json") {
      entries.push(createTarEntry(`${widgetId}/deps.json`, Buffer.from(content)));
    } else {
      entries.push(createTarEntry(`${widgetId}/${filePath}`, Buffer.from(content)));
    }
  }

  // Two 512-byte zero blocks mark end of archive
  entries.push(Buffer.alloc(1024));
  return Buffer.concat(entries);
}

function createTarEntry(name: string, data: Buffer): Buffer {
  const header = Buffer.alloc(512);
  const nameBytes = Buffer.from(name, "utf-8");
  nameBytes.copy(header, 0, 0, Math.min(nameBytes.length, 100));

  // File mode
  Buffer.from("0000644\0", "utf-8").copy(header, 100);
  // Owner/group ID
  Buffer.from("0001000\0", "utf-8").copy(header, 108);
  Buffer.from("0001000\0", "utf-8").copy(header, 116);
  // File size in octal
  Buffer.from(data.length.toString(8).padStart(11, "0") + "\0", "utf-8").copy(header, 124);
  // Modification time
  Buffer.from(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", "utf-8").copy(header, 136);
  // Type flag: regular file
  header[156] = 48; // '0'
  // Magic
  Buffer.from("ustar\0", "utf-8").copy(header, 257);
  Buffer.from("00", "utf-8").copy(header, 263);

  // Compute checksum
  Buffer.from("        ", "utf-8").copy(header, 148); // 8 spaces for checksum field
  let checksum = 0;
  for (let i = 0; i < 512; i++) checksum += header[i];
  Buffer.from(checksum.toString(8).padStart(6, "0") + "\0 ", "utf-8").copy(header, 148);

  // Pad data to 512-byte boundary
  const padding = (512 - (data.length % 512)) % 512;
  return Buffer.concat([header, data, Buffer.alloc(padding)]);
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
  const port = await ensureRuntime();

  const existing = widgetStatuses.get(widgetId);
  if (existing && existing.status === "ready") {
    if (existing.port === port) return existing;
    // Port changed (container recreated) — re-check below
  }

  const isStaleBuilding =
    existing?.status === "building" &&
    existing.startedAt &&
    Date.now() - existing.startedAt > BUILD_TIMEOUT_MS;

  if (existing?.status === "building" && !isStaleBuilding) {
    return existing;
  }

  // Check if already built in the container
  try {
    const result = await execInRuntime(`test -f /app/dist/${widgetId}/index.html && echo exists`);
    if (result.output.includes("exists")) {
      const status: WidgetStatus = { status: "ready", port };
      widgetStatuses.set(widgetId, status);
      return status;
    }
  } catch {
    // Not built yet
  }

  const status: WidgetStatus = { status: "building", port, startedAt: Date.now() };
  widgetStatuses.set(widgetId, status);
  buildWidget(widgetId).catch((err) => {
    console.error(`[widget-runtime] Background build failed for ${widgetId}:`, err);
  });
  return status;
}

export async function rebuildWidget(widgetId: string): Promise<WidgetStatus> {
  const port = await ensureRuntime();
  const status: WidgetStatus = { status: "building", port };
  widgetStatuses.set(widgetId, status);

  buildWidget(widgetId).catch((err) => {
    console.error(`[widget-runtime] Rebuild failed for ${widgetId}:`, err);
  });

  return status;
}

export async function stopWidget(widgetId: string): Promise<void> {
  widgetStatuses.delete(widgetId);
  if (!runtimeContainerId) return;
  try {
    await execInRuntime(`rm -rf /app/dist/${widgetId} /app/widgets/${widgetId}`);
  } catch {
    // Container might be gone
  }
}

export function getWidgetStatus(widgetId: string): WidgetStatus | null {
  return widgetStatuses.get(widgetId) ?? null;
}

async function waitForReady(port: number, timeout = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`http://localhost:${port}/`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok || res.status === 404) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Runtime container did not start within ${timeout}ms`);
}
