import type { WebContainer as WebContainerType, FileSystemTree } from "@webcontainer/api";
import { SCAFFOLD_FILES } from "@/lib/sandbox-template";

// ─── Singleton ───────────────────────────────────────────────────────────────
// WebContainers allows only ONE instance per browser tab.
// We boot once and reuse across all widgets.

let _wc: WebContainerType | null = null;
let _bootPromise: Promise<WebContainerType> | null = null;
let _devProcess: Awaited<ReturnType<WebContainerType["spawn"]>> | null = null;
let _previewUrl: string | null = null;
let _onServerReady: ((url: string) => void) | null = null;

export type WCStatus =
  | "idle"
  | "booting"
  | "installing"
  | "starting"
  | "ready"
  | "error";

let _status: WCStatus = "idle";
let _statusListeners: Array<(s: WCStatus) => void> = [];

function setStatus(s: WCStatus) {
  _status = s;
  _statusListeners.forEach((fn) => fn(s));
}

export function getStatus() {
  return _status;
}

export function onStatusChange(fn: (s: WCStatus) => void) {
  _statusListeners.push(fn);
  return () => {
    _statusListeners = _statusListeners.filter((f) => f !== fn);
  };
}

// ─── Boot ────────────────────────────────────────────────────────────────────

async function getWC(): Promise<WebContainerType> {
  if (_wc) return _wc;
  if (_bootPromise) return _bootPromise;

  setStatus("booting");
  const { WebContainer } = await import("@webcontainer/api");
  _bootPromise = WebContainer.boot().then((wc) => {
    _wc = wc;

    // Listen for server-ready once (persists across restarts)
    wc.on("server-ready", (_port, url) => {
      _previewUrl = url;
      setStatus("ready");
      _onServerReady?.(url);
    });

    return wc;
  });

  return _bootPromise;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convert flat { "src/app/page.tsx": content } to FileSystemTree */
function toFileTree(files: Record<string, string>): FileSystemTree {
  const tree: FileSystemTree = {};

  for (const [filePath, contents] of Object.entries(files)) {
    const parts = filePath.split("/");
    let node = tree;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!node[part]) node[part] = { directory: {} };
      node = (node[part] as { directory: FileSystemTree }).directory;
    }
    node[parts[parts.length - 1]] = { file: { contents } };
  }

  return tree;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Write a single file to the running WebContainer FS immediately. */
export async function writeFile(path: string, content: string) {
  const wc = await getWC();
  // Ensure parent dirs exist
  const dir = path.split("/").slice(0, -1).join("/");
  if (dir) await wc.fs.mkdir(dir, { recursive: true });
  await wc.fs.writeFile(path, content);
}

/** Read a file from the WebContainer FS. */
export async function readFile(path: string): Promise<string> {
  const wc = await getWC();
  return wc.fs.readFile(path, "utf-8");
}

/**
 * Run a command and wait for exit. Returns { exitCode, stdout, stderr }.
 * Streams output to the provided callback if given.
 */
export async function runCommand(
  command: string,
  args: string[],
  onOutput?: (line: string) => void
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const wc = await getWC();
  const proc = await wc.spawn(command, args);

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];

  proc.output.pipeTo(
    new WritableStream({
      write(chunk) {
        stdoutLines.push(chunk);
        onOutput?.(chunk);
      },
    })
  );

  const exitCode = await proc.exit;
  return {
    exitCode,
    stdout: stdoutLines.join("").slice(0, 5000),
    stderr: stderrLines.join("").slice(0, 5000),
  };
}

/**
 * Bootstrap the WebContainer with a widget's files.
 * Mounts scaffold + widget files, runs npm install, starts dev server.
 * Returns the preview URL via callback.
 */
export async function bootWidget(
  widgetFiles: Record<string, string>,
  onUrl: (url: string) => void
): Promise<void> {
  const wc = await getWC();

  // Kill existing dev server if running
  if (_devProcess) {
    try { _devProcess.kill(); } catch { /* ignore */ }
    _devProcess = null;
    _previewUrl = null;
  }

  _onServerReady = onUrl;

  // Mount scaffold + widget files
  setStatus("installing");
  const allFiles = { ...SCAFFOLD_FILES, ...widgetFiles };
  await wc.mount(toFileTree(allFiles));

  // npm install
  const installProc = await wc.spawn("npm", ["install"]);
  const installExit = await installProc.exit;
  if (installExit !== 0) {
    setStatus("error");
    return;
  }

  // Start dev server (detached)
  setStatus("starting");
  _devProcess = await wc.spawn("npm", ["run", "dev"]);
  // Don't await — server-ready event will fire
}

/**
 * Update widget files in a running WebContainer (hot reload via Next.js HMR).
 * Does NOT restart npm install or dev server.
 */
export async function updateWidgetFiles(
  widgetFiles: Record<string, string>
): Promise<void> {
  for (const [path, content] of Object.entries(widgetFiles)) {
    await writeFile(path, content);
  }
}

export function getPreviewUrl() {
  return _previewUrl;
}
