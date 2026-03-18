import { NextRequest } from "next/server";
import * as fs from "fs";
import * as nodePath from "path";
import { ensureWidget, getWidgetDistPath } from "@/lib/widget-builder";
import { getWidgetCode } from "@/db/widgets";

const LOADING_HTML = `<!DOCTYPE html>
<html class="dark">
<head><meta charset="UTF-8"><meta http-equiv="refresh" content="1"></head>
<body style="margin:0;background:#18181b;display:flex;align-items:center;justify-content:center;height:100vh;font-family:ui-monospace,monospace;color:#a1a1aa;">
<div style="text-align:center">
<div style="animation:spin 1s linear infinite;display:inline-block;width:32px;height:32px;border:3px solid #3f3f46;border-top-color:#a1a1aa;border-radius:50%;margin-bottom:12px"></div>
<div style="font-size:14px;">Building widget…</div>
</div>
<style>@keyframes spin{to{transform:rotate(360deg)}}</style>
</body>
</html>`;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
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
};

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; path?: string[] }> }
) {
  const { id, path: pathSegments } = await params;

  const code = getWidgetCode(id);
  if (!code) {
    // Widget may not be persisted yet (template bootstrap race condition)
    return new Response(LOADING_HTML, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
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

  if (!fs.existsSync(filePath)) {
    return new Response("Not found", { status: 404 });
  }

  const ext = nodePath.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";
  const content = fs.readFileSync(filePath);

  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "no-store",
    },
  });
}
