import { createHash } from "node:crypto";
import { getDashboard, getWidget, getTextBlock, getWidgetFiles, upsertWidget } from "@/db/widgets";
import { buildWidget, rebuildWidget } from "@/lib/widget-runner";
import { getPublishedWidgetId } from "@/lib/share";
import {
  isCanvasViewportSnapshot,
  normalizeCanvasViewport,
  DEFAULT_CANVAS_VIEWPORT,
  type CanvasViewportSnapshot,
} from "@/lib/canvas-viewport";
import type { DashboardSharedStateV1, PublishedCanvasLayout } from "@/lib/share-types";

export interface DashboardPublishSource {
  dashboardId: string;
  title: string;
  viewport: CanvasViewportSnapshot;
  widgets: Array<{ id: string; title: string; description: string; layout: PublishedCanvasLayout; files: Record<string, string> }>;
  textBlocks: Array<{ id: string; text: string; fontSize: number; layout: PublishedCanvasLayout }>;
}

function parseStringArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try { const p = JSON.parse(value); return Array.isArray(p) ? p.filter((e): e is string => typeof e === "string") : []; }
  catch { return []; }
}

function parseLayout(value: string | null | undefined, fallback: PublishedCanvasLayout): PublishedCanvasLayout {
  if (!value) return fallback;
  try {
    const p = JSON.parse(value) as Partial<PublishedCanvasLayout>;
    return { x: typeof p.x === "number" ? p.x : fallback.x, y: typeof p.y === "number" ? p.y : fallback.y, w: typeof p.w === "number" ? p.w : fallback.w, h: typeof p.h === "number" ? p.h : fallback.h };
  } catch { return fallback; }
}

function parseViewport(value: string | null | undefined): CanvasViewportSnapshot {
  if (!value) return DEFAULT_CANVAS_VIEWPORT;
  try { const p = JSON.parse(value); return isCanvasViewportSnapshot(p) ? normalizeCanvasViewport(p) : DEFAULT_CANVAS_VIEWPORT; }
  catch { return DEFAULT_CANVAS_VIEWPORT; }
}

function sortStringRecord(value: Record<string, string>) {
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)));
}

function hashString(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildWidgetRevision(files: Record<string, string>) {
  return hashString(JSON.stringify(sortStringRecord(files))).slice(0, 16);
}

export function loadDashboardPublishSource(dashboardId: string): DashboardPublishSource {
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) throw new Error(`Dashboard not found: ${dashboardId}`);

  const widgetIds = parseStringArray(dashboard.widgetIdsJson);
  const textBlockIds = parseStringArray(dashboard.textBlockIdsJson);

  return {
    dashboardId: dashboard.id,
    title: dashboard.title,
    viewport: parseViewport(dashboard.viewportJson),
    widgets: widgetIds.flatMap((id) => {
      const w = getWidget(id);
      if (!w) return [];
      return [{ id: w.id, title: w.title, description: w.description, layout: parseLayout(w.layoutJson, { x: 0, y: 0, w: 4, h: 3 }), files: getWidgetFiles(id) }];
    }),
    textBlocks: textBlockIds.flatMap((id) => {
      const tb = getTextBlock(id);
      if (!tb) return [];
      return [{ id: tb.id, text: tb.text, fontSize: tb.fontSize, layout: parseLayout(tb.layoutJson, { x: 0, y: 0, w: 3, h: 1 }) }];
    }),
  };
}

export function buildDashboardSharedState(source: DashboardPublishSource, shareId: string, updatedAt = new Date().toISOString()): DashboardSharedStateV1 {
  return {
    version: "v1",
    shareId,
    dashboardId: source.dashboardId,
    title: source.title,
    updatedAt,
    viewport: source.viewport,
    textBlocks: source.textBlocks.map((tb) => ({ id: tb.id, text: tb.text, fontSize: tb.fontSize, layout: tb.layout })),
    widgets: source.widgets.map((w) => {
      const files = sortStringRecord(w.files);
      return { sourceWidgetId: w.id, publishedWidgetId: getPublishedWidgetId(shareId, w.id), revision: buildWidgetRevision(files), title: w.title, description: w.description, layout: w.layout, files };
    }),
  };
}

export function buildDashboardStateContentHash(state: DashboardSharedStateV1): string {
  const { updatedAt: _, ...stable } = state;
  return hashString(JSON.stringify(stable));
}

export async function materializePublishedWidgets(state: DashboardSharedStateV1, { waitForBuild }: { waitForBuild: boolean }) {
  for (const widget of state.widgets) {
    const existing = getWidget(widget.publishedWidgetId);
    const nextFilesJson = JSON.stringify(widget.files);
    const filesChanged = existing?.filesJson !== nextFilesJson;

    upsertWidget({
      id: widget.publishedWidgetId,
      title: widget.title,
      description: widget.description,
      code: widget.files["src/App.tsx"] ?? null,
      filesJson: nextFilesJson,
      layoutJson: JSON.stringify(widget.layout),
      messagesJson: JSON.stringify([]),
    });

    if (!filesChanged || !widget.files["src/App.tsx"]) continue;
    if (waitForBuild) await buildWidget(widget.publishedWidgetId);
    else rebuildWidget(widget.publishedWidgetId).catch((err) => console.error(`Failed to rebuild ${widget.publishedWidgetId}:`, err));
  }
}
