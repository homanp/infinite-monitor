import { NextRequest } from "next/server";
import * as fs from "fs";
import * as path from "path";
import { ensureWidget, getWidgetDistPath } from "@/lib/widget-builder";
import { getWidgetCode } from "@/db/widgets";

const LOADING_HTML = `<!DOCTYPE html>
<html class="dark">
<head><meta charset="UTF-8"><meta http-equiv="refresh" content="2"></head>
<body style="margin:0;background:#27272a;display:flex;align-items:center;justify-content:center;height:100vh;font-family:ui-monospace,monospace;color:#71717a;font-size:12px;">
<div style="text-align:center">
<div style="animation:spin 1s linear infinite;display:inline-block;width:16px;height:16px;border:2px solid #52525b;border-top-color:#a1a1aa;border-radius:50%;margin-bottom:8px"></div>
<div>Building widget…</div>
</div>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
</body>
</html>`;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path: pathSegments } = await params;

  const code = getWidgetCode(id);
  if (!code) {
    return new Response("Widget not found", { status: 404 });
  }

  const widget = await ensureWidget(id);

  if (widget.status !== "ready") {
    return new Response(LOADING_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  const subPath = pathSegments?.join("/") ?? "";
  const filePath = subPath
    ? getWidgetDistPath(id, subPath)
    : getWidgetDistPath(id, "index.html");

  try {
    if (!fs.existsSync(filePath)) {
      return new Response("Not found", { status: 404 });
    }

    const content = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    if (!subPath && contentType.includes("text/html")) {
      const html = content.toString("utf-8");
      const baseTag = `<base href="/api/widget/${id}/">`;
      const patched = html.replace("<head>", `<head>${baseTag}`);
      return new Response(patched, {
        status: 200,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    return new Response(content, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": ext === ".js" || ext === ".css"
          ? "public, max-age=31536000, immutable"
          : "no-store",
      },
    });
  } catch {
    return new Response(LOADING_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}
