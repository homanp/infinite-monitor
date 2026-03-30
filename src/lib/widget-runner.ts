import {
	NodeRuntime,
	NodeFileSystem,
	createNodeDriver,
	createNodeRuntimeDriverFactory,
	allowAllFs,
	allowAllNetwork,
	allowAllChildProcess,
	type CommandExecutor,
} from "secure-exec";
import { spawn, exec as execCb, execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import {
	cpSync,
	mkdtempSync,
	writeFileSync,
	mkdirSync,
	existsSync,
	rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import getPort, { portNumbers } from "get-port";
import {
	getWidgetFiles,
	setWidgetFiles,
	getWidget,
	upsertWidget,
} from "@/db/widgets";

const execAsync = promisify(execCb);
const TEMPLATE_INSTALL_CMD = "npm install --include=dev";

// ── Types ──

interface WidgetStatus {
	status: "building" | "ready" | "error";
	port: number;
	startedAt?: number;
	error?: string;
}

interface WidgetSandbox {
	runtime: NodeRuntime;
	port: number;
	sandboxDir?: string;
}

// ── Per-widget state ──

const widgetSandboxes = new Map<string, WidgetSandbox>();
const widgetStatuses = new Map<string, WidgetStatus>();
const buildLocks = new Map<string, Promise<void>>();
const restoreLocks = new Map<string, Promise<WidgetStatus | null>>();

const DB_PATH =
	process.env.DATABASE_PATH || join(process.cwd(), "data", "widgets.db");
const DATA_DIR =
	DB_PATH === ":memory:" ? join(process.cwd(), "data") : dirname(DB_PATH);
const WIDGET_BUILD_CACHE_DIR = join(DATA_DIR, "widget-builds");
const BASE_TEMPLATE_VERSION = 2;
const WIDGET_CACHE_VERSION = 1;
const REQUIRED_BASE_TEMPLATE_FILES = [
	"index.html",
	"vite.config.ts",
	"tsconfig.json",
	"tailwind.config.ts",
	"src/lib/utils.ts",
	"src/components/ui/alert.tsx",
	"src/components/ui/badge.tsx",
	"src/components/ui/button.tsx",
	"src/components/ui/card.tsx",
	"src/components/ui/scroll-area.tsx",
	"src/components/ui/skeleton.tsx",
	"src/components/ui/tabs.tsx",
];
const REQUIRED_BASE_TEMPLATE_PACKAGES = [
	"vite",
	"react",
	"react-dom",
	"@vitejs/plugin-react",
	"lucide-react",
	"date-fns",
	"recharts",
	"framer-motion",
	"tailwindcss",
];

async function disposeWidgetRuntime(widgetId: string): Promise<void> {
	const sb = widgetSandboxes.get(widgetId);
	if (!sb) return;
	try {
		await sb.runtime.terminate();
		sb.runtime.dispose();
	} catch {
		/* */
	}
	if (sb.sandboxDir) {
		try {
			rmSync(sb.sandboxDir, { recursive: true, force: true });
		} catch {
			/* */
		}
	}
	widgetSandboxes.delete(widgetId);
}

function isValidBaseTemplate(dir: string): boolean {
	if (!existsSync(join(dir, "node_modules", ".package-lock.json"))) {
		return false;
	}

	for (const file of REQUIRED_BASE_TEMPLATE_FILES) {
		if (!existsSync(join(dir, file))) return false;
	}

	for (const pkg of REQUIRED_BASE_TEMPLATE_PACKAGES) {
		if (!existsSync(join(dir, "node_modules", pkg, "package.json"))) {
			return false;
		}
	}

	return true;
}

function getWidgetSourceHash(files: Record<string, string>): string {
	return createHash("sha256")
		.update(String(BASE_TEMPLATE_VERSION))
		.update("\0")
		.update(String(WIDGET_CACHE_VERSION))
		.update("\0")
		.update(JSON.stringify(files))
		.digest("hex")
		.slice(0, 16);
}

function getWidgetCacheRoot(
	widgetId: string,
	files: Record<string, string>,
): string {
	return join(WIDGET_BUILD_CACHE_DIR, widgetId, getWidgetSourceHash(files));
}

function getCachedWidgetBuild(widgetId: string): {
	rootDir: string;
	distDir: string;
} | null {
	const files = getWidgetFiles(widgetId);
	if (!files["src/App.tsx"]) return null;

	const rootDir = getWidgetCacheRoot(widgetId, files);
	const distDir = join(rootDir, "dist");
	if (!existsSync(join(distDir, "index.html"))) return null;

	return { rootDir, distDir };
}

function persistWidgetBuild(
	widgetId: string,
	files: Record<string, string>,
	distDir: string,
): string {
	const widgetDir = join(WIDGET_BUILD_CACHE_DIR, widgetId);
	const rootDir = getWidgetCacheRoot(widgetId, files);
	const cachedDistDir = join(rootDir, "dist");

	rmSync(widgetDir, { recursive: true, force: true });
	mkdirSync(rootDir, { recursive: true });
	cpSync(distDir, cachedDistDir, { recursive: true });
	writeFileSync(
		join(rootDir, "meta.json"),
		JSON.stringify(
			{
				widgetId,
				hash: getWidgetSourceHash(files),
				cachedAt: Date.now(),
			},
			null,
			2,
		),
	);

	return cachedDistDir;
}

function createWidgetRuntime(workingDir: string): NodeRuntime {
	return new NodeRuntime({
		systemDriver: createNodeDriver({
			filesystem: new NodeFileSystem(),
			useDefaultNetwork: true,
			commandExecutor,
			permissions: {
				...allowAllFs,
				...allowAllNetwork,
				...allowAllChildProcess,
			},
			processConfig: { cwd: workingDir },
		}),
		runtimeDriverFactory: createNodeRuntimeDriverFactory(),
		memoryLimit: 64,
		cpuTimeLimitMs: 86_400_000,
	});
}

async function restoreWidgetFromCache(
	widgetId: string,
): Promise<WidgetStatus | null> {
	const cached = getCachedWidgetBuild(widgetId);
	if (!cached) return null;

	const port = await getPort({ port: portNumbers(4100, 4999) });
	await disposeWidgetRuntime(widgetId);

	let runtime: NodeRuntime | null = null;
	try {
		runtime = createWidgetRuntime(cached.rootDir);
		startFileServer(runtime, cached.distDir, port);
		await waitForServer(`http://127.0.0.1:${port}/`);

		const status: WidgetStatus = { status: "ready", port };
		widgetSandboxes.set(widgetId, { runtime, port });
		widgetStatuses.set(widgetId, status);
		console.log(`[secure-exec] Restored cached widget ${widgetId}`);
		return status;
	} catch (err) {
		console.warn(
			`[secure-exec] Cached widget restore failed for ${widgetId}; rebuilding`,
			err,
		);
		if (runtime) {
			try {
				await runtime.terminate();
				runtime.dispose();
			} catch {
				/* */
			}
		}
		rmSync(cached.rootDir, { recursive: true, force: true });
		return null;
	}
}

async function restoreCachedWidget(
	widgetId: string,
	previousStatus?: WidgetStatus,
): Promise<WidgetStatus | null> {
	const existingRestore = restoreLocks.get(widgetId);
	if (existingRestore) return await existingRestore;

	widgetStatuses.set(widgetId, {
		status: "building",
		port: previousStatus?.port ?? 0,
		startedAt: Date.now(),
	});

	const promise = restoreWidgetFromCache(widgetId);
	restoreLocks.set(widgetId, promise);
	try {
		return await promise;
	} finally {
		restoreLocks.delete(widgetId);
	}
}

// ── Command executor: bridges SecureExec child_process to host ──

const commandExecutor: CommandExecutor = {
	spawn(command, args, options) {
		const resolved = command === "node" ? process.execPath : command;
		const child = spawn(resolved, args, {
			cwd: options.cwd ?? undefined,
			env: { ...process.env, ...(options.env ?? {}) } as NodeJS.ProcessEnv,
			stdio: ["pipe", "pipe", "pipe"],
		});
		child.on("error", (err) =>
			options.onStderr?.(
				new TextEncoder().encode(`spawn error: ${err.message}`),
			),
		);
		child.stdout!.on("data", (c: Buffer) =>
			options.onStdout?.(new Uint8Array(c)),
		);
		child.stderr!.on("data", (c: Buffer) =>
			options.onStderr?.(new Uint8Array(c)),
		);
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
					child.once("error", () => resolve(1));
					child.once("close", (code: number | null) => resolve(code ?? 1));
				});
			},
		};
	},
};

// ── Template content ──

const TEMPLATES: Record<string, string> = {
	"index.html": `<!DOCTYPE html>\n<html lang="en" class="dark">\n  <head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Widget</title></head>\n  <body style="margin:0; background:transparent;"><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>`,

	"src/main.tsx": `import React from "react";\nimport { createRoot } from "react-dom/client";\nimport "./index.css";\nimport App from "./App";\n\ncreateRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);`,

	"src/index.css": `@tailwind base;\n@tailwind components;\n@tailwind utilities;\n\n*, *::before, *::after { box-sizing: border-box; }\nhtml, body { margin:0; padding:0; width:100%; height:100%; font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; font-size:13px; overflow:hidden; background:transparent; color:#f4f4f5; }\n#root { width:100%; height:100%; }\n::-webkit-scrollbar { width:4px; height:4px; }\n::-webkit-scrollbar-track { background:transparent; }\n::-webkit-scrollbar-thumb { background:#525252; border-radius:2px; }\n* { scrollbar-width:thin; scrollbar-color:#525252 transparent; }`,

	"src/lib/utils.ts": `import { clsx, type ClassValue } from "clsx";\nimport { twMerge } from "tailwind-merge";\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs));\n}`,

	"vite.config.ts": `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\nimport path from "path";\n\nexport default defineConfig({\n  plugins: [react()],\n  base: "./",\n  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },\n  server: { hmr: false },\n});`,

	"tsconfig.json": JSON.stringify(
		{
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
		},
		null,
		2,
	),

	"postcss.config.js": `export default { plugins: { tailwindcss: {}, autoprefixer: {} } };`,

	"tailwind.config.ts": `/** @type {import('tailwindcss').Config} */\nexport default { darkMode: "class", content: ["./index.html", "./src/**/*.{ts,tsx}"], theme: { extend: {} }, plugins: [] };`,

	"package.json": JSON.stringify(
		{
			name: "widget",
			private: true,
			version: "0.0.1",
			type: "module",
			scripts: { build: "vite build" },
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
				tailwindcss: "^3.4.1",
				autoprefixer: "^10.4.20",
				postcss: "^8.4.40",
				typescript: "^5.5.3",
				vite: "^5.4.1",
			},
		},
		null,
		2,
	),

	"components.json": JSON.stringify({
		$schema: "https://ui.shadcn.com/schema.json",
		style: "default",
		rsc: false,
		tsx: true,
		tailwind: {
			config: "tailwind.config.ts",
			css: "src/index.css",
			baseColor: "neutral",
			cssVariables: true,
		},
		aliases: {
			components: "@/components",
			utils: "@/lib/utils",
			ui: "@/components/ui",
			lib: "@/lib",
			hooks: "@/hooks",
		},
	}),
};

const SHADCN_COMPONENTS =
	"button card badge input table tabs scroll-area skeleton separator progress alert avatar checkbox dialog dropdown-menu label popover radio-group select sheet slider switch textarea toggle tooltip accordion collapsible command context-menu hover-card menubar navigation-menu pagination resizable sonner";

// ── Shared base template (created once, copied into each sandbox) ──

const PREBAKED_DIR = join(process.cwd(), ".cache", "widget-base-template");

let baseTemplateDir: string | null = null;
let baseTemplatePromise: Promise<string> | null = null;

function getBuildErrorMessage(error: unknown): string {
	if (error && typeof error === "object") {
		const err = error as {
			stderr?: string | Buffer;
			stdout?: string | Buffer;
			message?: string;
		};
		const detail = err.stderr ?? err.stdout ?? err.message;
		if (detail) {
			return String(detail).trim().split("\n").slice(-8).join("\n");
		}
	}
	if (typeof error === "string") return error;
	return "Unknown widget build error";
}

async function ensureBaseTemplate(): Promise<string> {
	if (baseTemplateDir && isValidBaseTemplate(baseTemplateDir)) {
		return baseTemplateDir;
	}
	if (baseTemplatePromise) return baseTemplatePromise;

	baseTemplatePromise = (async () => {
		// Prefer the pre-baked directory produced by scripts/prebuild-template.mjs
		// during `npm run build`. Fall back to tmpdir for local dev.
		const dir = isValidBaseTemplate(PREBAKED_DIR)
			? PREBAKED_DIR
			: join(tmpdir(), "widget-base-template");

		if (isValidBaseTemplate(dir)) {
			baseTemplateDir = dir;
			console.log("[secure-exec] Reusing base template at", dir);
			return dir;
		}

		rmSync(dir, { recursive: true, force: true });
		mkdirSync(dir, { recursive: true });

		console.log("[secure-exec] Installing shared base template...");
		for (const [path, content] of Object.entries(TEMPLATES)) {
			const full = join(dir, path);
			mkdirSync(join(full, ".."), { recursive: true });
			writeFileSync(full, content);
		}

		await execAsync(TEMPLATE_INSTALL_CMD, { cwd: dir, timeout: 120_000 });
		console.log("[secure-exec] npm install done");

		try {
			await execAsync(`npx shadcn@latest add --yes ${SHADCN_COMPONENTS}`, {
				cwd: dir,
				timeout: 120_000,
			});
			console.log("[secure-exec] shadcn components installed");
		} catch {
			console.warn(
				"[secure-exec] Some shadcn components may have failed (non-fatal)",
			);
		}

		if (!isValidBaseTemplate(dir)) {
			throw new Error(
				"Base template install is incomplete; required packages or UI files are missing",
			);
		}

		console.log("[secure-exec] Base template ready at", dir);
		baseTemplateDir = dir;
		return dir;
	})();

	try {
		return await baseTemplatePromise;
	} finally {
		baseTemplatePromise = null;
	}
}

/** Fire-and-forget warm-up — call from instrumentation.ts at server start. */
export function warmBaseTemplate(): void {
	ensureBaseTemplate().catch((err) =>
		console.error("[secure-exec] Base template warm-up failed:", err),
	);
}

// ── Security ──

const VALID_PACKAGE_RE = /^(@[\w.-]+\/)?[\w.-]+(@[\w.^~>=<| -]+)?$/;

export function sanitizePath(relativePath: string): string {
	const normalized = relativePath.replace(/\\/g, "/");
	if (normalized.startsWith("/") || normalized.includes(".."))
		throw new Error(`Invalid path: ${relativePath}`);
	if (!normalized.startsWith("src/"))
		throw new Error(`Path must be under src/: ${relativePath}`);
	return normalized;
}

export function validatePackages(packages: string[]): void {
	for (const pkg of packages) {
		if (!VALID_PACKAGE_RE.test(pkg))
			throw new Error(`Invalid package name: ${pkg}`);
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
	return getWidgetFiles(widgetId)[sanitizePath(relativePath)] ?? null;
}

export async function listWidgetFiles(widgetId: string): Promise<string[]> {
	return Object.keys(getWidgetFiles(widgetId)).sort();
}

export async function deleteWidgetFile(
	widgetId: string,
	relativePath: string,
): Promise<void> {
	const safePath = sanitizePath(relativePath);
	if (safePath === "src/App.tsx")
		throw new Error("Cannot delete the entry point App.tsx");
	const files = getWidgetFiles(widgetId);
	delete files[safePath];
	setWidgetFiles(widgetId, files);
}

export async function addWidgetDependencies(
	widgetId: string,
	packages: string[],
): Promise<string[]> {
	validatePackages(packages);
	const files = getWidgetFiles(widgetId);
	let existing: string[] = [];
	try {
		if (files["deps.json"]) existing = JSON.parse(files["deps.json"]);
	} catch {
		/* */
	}
	const merged = [...new Set([...existing, ...packages])];
	files["deps.json"] = JSON.stringify(merged);
	setWidgetFiles(widgetId, files);
	return merged;
}

// ── Sandbox creation ──

function createSandboxDir(
	baseDir: string,
	files: Record<string, string>,
): string {
	const dir = mkdtempSync(join(tmpdir(), "widget-sandbox-"));

	for (const name of [
		"vite.config.ts",
		"tsconfig.json",
		"postcss.config.js",
		"tailwind.config.ts",
		"index.html",
		"package.json",
		"components.json",
	]) {
		const src = join(baseDir, name);
		if (existsSync(src)) {
			try {
				execSync(`cp "${src}" "${join(dir, name)}"`, { stdio: "pipe" });
			} catch {
				/* */
			}
		}
	}

	execSync(
		`ln -s "${join(baseDir, "node_modules")}" "${join(dir, "node_modules")}"`,
		{ stdio: "pipe" },
	);
	execSync(`cp -r "${join(baseDir, "src")}" "${join(dir, "src")}"`, {
		stdio: "pipe",
	});

	for (const [filePath, content] of Object.entries(files)) {
		if (filePath === "deps.json") continue;
		const fullPath = join(dir, filePath);
		mkdirSync(join(fullPath, ".."), { recursive: true });
		writeFileSync(fullPath, content);
	}

	return dir;
}

function startFileServer(
	runtime: NodeRuntime,
	distDir: string,
	port: number,
): Promise<unknown> {
	return runtime.exec(
		`
    (async () => {
      const http = require("node:http");
      const fs = require("node:fs");
      const path = require("node:path");
      const distDir = ${JSON.stringify(distDir)};
      const mimeTypes = { ".html":"text/html; charset=utf-8", ".js":"application/javascript; charset=utf-8", ".mjs":"application/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".png":"image/png", ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".woff":"font/woff", ".woff2":"font/woff2" };
      const server = http.createServer((req, res) => {
        let p = new URL(req.url, "http://localhost").pathname;
        if (p === "/" || p === "") p = "/index.html";
        const fp = path.join(distDir, p);
        try {
          if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
            const ext = path.extname(fp).toLowerCase();
            res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream", "Cache-Control": "no-store" });
            res.end(fs.readFileSync(fp));
          } else {
            const idx = path.join(distDir, "index.html");
            if (fs.existsSync(idx)) { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); res.end(fs.readFileSync(idx)); }
            else { res.writeHead(404); res.end("Not Found"); }
          }
        } catch { res.writeHead(500); res.end("Error"); }
      });
      await new Promise((ok, fail) => { server.once("error", fail); server.listen(${port}, "127.0.0.1", ok); });
      console.log("SERVER_LISTENING:${port}");
      await new Promise(() => {});
    })().catch(e => { console.error("SERVER_ERROR:", e.message); process.exitCode = 1; });
  `,
		{
			onStdio: (event) => {
				if (event.message.includes("SERVER_LISTENING"))
					console.log(`[secure-exec] File server on port ${port}`);
			},
		},
	);
}

async function waitForServer(url: string, timeout = 10000): Promise<void> {
	const start = Date.now();
	while (Date.now() - start < timeout) {
		try {
			const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
			if (r.ok || r.status === 404) return;
		} catch {
			/* not ready */
		}
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`Server at ${url} timed out`);
}

// ── Build pipeline ──

async function doBuild(widgetId: string): Promise<void> {
	const port = await getPort({ port: portNumbers(4100, 4999) });
	widgetStatuses.set(widgetId, {
		status: "building",
		port,
		startedAt: Date.now(),
	});
	let sandboxDir: string | null = null;
	let runtime: NodeRuntime | null = null;

	try {
		const files = getWidgetFiles(widgetId);
		if (!files["src/App.tsx"]) {
			widgetStatuses.set(widgetId, {
				status: "error",
				port,
				startedAt: Date.now(),
				error: "Missing src/App.tsx",
			});
			console.error(`[secure-exec] No src/App.tsx for ${widgetId}`);
			return;
		}

		await disposeWidgetRuntime(widgetId);

		const baseDir = await ensureBaseTemplate();
		sandboxDir = createSandboxDir(baseDir, files);
		const distDir = join(sandboxDir, "dist");

		let extraDeps: string[] = [];
		if (files["deps.json"]) {
			try {
				extraDeps = JSON.parse(files["deps.json"]);
			} catch {
				/* */
			}
		}
		if (extraDeps.length > 0) {
			await execAsync(`npm install --no-save ${extraDeps.join(" ")}`, {
				cwd: sandboxDir,
				timeout: 60_000,
			});
		}

		console.log(`[secure-exec] Building widget ${widgetId}...`);
		await execAsync(`npx vite build --outDir "${distDir}"`, {
			cwd: sandboxDir,
			timeout: 60_000,
		});
		console.log(`[secure-exec] Widget ${widgetId} built`);

		const cachedDistDir = persistWidgetBuild(widgetId, files, distDir);
		try {
			rmSync(sandboxDir, { recursive: true, force: true });
			sandboxDir = null;
		} catch {
			/* */
		}

		runtime = createWidgetRuntime(dirname(cachedDistDir));
		startFileServer(runtime, cachedDistDir, port);
		await waitForServer(`http://127.0.0.1:${port}/`);

		widgetSandboxes.set(widgetId, { runtime, port });
		widgetStatuses.set(widgetId, { status: "ready", port });
		console.log(`[secure-exec] Widget ${widgetId} serving on port ${port}`);
	} catch (err) {
		console.error(`[secure-exec] Build error for ${widgetId}:`, err);
		widgetStatuses.set(widgetId, {
			status: "error",
			port,
			startedAt: Date.now(),
			error: getBuildErrorMessage(err),
		});
		if (runtime) {
			try {
				await runtime.terminate();
				runtime.dispose();
			} catch {
				/* */
			}
		}
	} finally {
		if (sandboxDir) {
			try {
				rmSync(sandboxDir, { recursive: true, force: true });
			} catch {
				/* */
			}
		}
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

const BUILD_TIMEOUT_MS = 120_000;
const ERROR_RETRY_MS = 30_000;

export async function ensureWidget(widgetId: string): Promise<WidgetStatus> {
	const existing = widgetStatuses.get(widgetId);
	if (existing?.status === "ready" && widgetSandboxes.has(widgetId))
		return existing;
	const isStale =
		existing?.status === "building" &&
		existing.startedAt &&
		Date.now() - existing.startedAt > BUILD_TIMEOUT_MS;
	if (existing?.status === "building" && !isStale) return existing;

	const restored = await restoreCachedWidget(widgetId, existing);
	if (restored) return restored;

	const shouldRetryError =
		existing?.status === "error" &&
		existing.startedAt &&
		Date.now() - existing.startedAt > ERROR_RETRY_MS;
	if (existing?.status === "error" && !shouldRetryError) {
		widgetStatuses.set(widgetId, existing);
		return existing;
	}

	const port = await getPort({ port: portNumbers(4100, 4999) });
	const status: WidgetStatus = {
		status: "building",
		port,
		startedAt: Date.now(),
	};
	widgetStatuses.set(widgetId, status);
	buildWidget(widgetId).catch((err) =>
		console.error(
			`[secure-exec] Background build failed for ${widgetId}:`,
			err,
		),
	);
	return status;
}

export async function rebuildWidget(widgetId: string): Promise<WidgetStatus> {
	const port = await getPort({ port: portNumbers(4100, 4999) });
	const status: WidgetStatus = {
		status: "building",
		port,
		startedAt: Date.now(),
	};
	widgetStatuses.set(widgetId, status);
	buildWidget(widgetId).catch((err) =>
		console.error(`[secure-exec] Rebuild failed for ${widgetId}:`, err),
	);
	return status;
}

export async function stopWidget(widgetId: string): Promise<void> {
	widgetStatuses.delete(widgetId);
	await disposeWidgetRuntime(widgetId);
}

export function getWidgetStatus(widgetId: string): WidgetStatus | null {
	return widgetStatuses.get(widgetId) ?? null;
}

export async function fetchFromWidget(
	widgetId: string,
	path: string,
	headers?: Record<string, string>,
): Promise<{ status: number; body: string; contentType: string } | null> {
	const sb = widgetSandboxes.get(widgetId);
	if (!sb) return null;
	try {
		const url = `http://127.0.0.1:${sb.port}/${path}`;
		const r = await fetch(url, {
			headers: headers ?? {},
			signal: AbortSignal.timeout(10000),
		});
		const body = await r.text();
		return {
			status: r.status,
			body,
			contentType: r.headers.get("content-type") ?? "text/html",
		};
	} catch {
		return null;
	}
}
