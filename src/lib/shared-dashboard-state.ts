import { createHash } from "node:crypto";
import {
  getDashboard,
  getTextBlock,
  getWidget,
  getWidgetFiles,
  upsertWidget,
} from "@/db/widgets";
import { buildWidget, rebuildWidget } from "@/lib/widget-runner";
import { getPublishedWidgetId } from "@/lib/share";
import {
  isCanvasViewportSnapshot,
  normalizeCanvasViewport,
  type CanvasViewportSnapshot,
} from "@/lib/canvas-viewport";
import {
  DEFAULT_CANVAS_VIEWPORT,
} from "@/lib/canvas-viewport";
import type {
  DashboardSharedStateV1,
  PublishedCanvasLayout,
} from "@/lib/share-types";

export interface DashboardPublishTextBlockSource {
  id: string;
  text: string;
  fontSize: number;
  layout: PublishedCanvasLayout;
}

export interface DashboardPublishWidgetSource {
  id: string;
  title: string;
  description: string;
  layout: PublishedCanvasLayout;
  files: Record<string, string>;
  messages?: unknown[];
}

export interface DashboardPublishSource {
  dashboardId: string;
  title: string;
  viewport: CanvasViewportSnapshot;
  widgets: DashboardPublishWidgetSource[];
  textBlocks: DashboardPublishTextBlockSource[];
}

function parseStringArray(value: string | null | undefined) {
  if (!value) {
    return [] as string[];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string")
      : [];
  } catch {
    return [];
  }
}

function parseLayout(
  value: string | null | undefined,
  fallback: PublishedCanvasLayout,
): PublishedCanvasLayout {
  if (!value) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PublishedCanvasLayout>;
    return {
      x: typeof parsed.x === "number" ? parsed.x : fallback.x,
      y: typeof parsed.y === "number" ? parsed.y : fallback.y,
      w: typeof parsed.w === "number" ? parsed.w : fallback.w,
      h: typeof parsed.h === "number" ? parsed.h : fallback.h,
    };
  } catch {
    return fallback;
  }
}

function parseViewport(value: string | null | undefined) {
  if (!value) {
    return DEFAULT_CANVAS_VIEWPORT;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isCanvasViewportSnapshot(parsed)
      ? normalizeCanvasViewport(parsed)
      : DEFAULT_CANVAS_VIEWPORT;
  } catch {
    return DEFAULT_CANVAS_VIEWPORT;
  }
}

function sortStringRecord(value: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function hashString(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function buildWidgetRevision(files: Record<string, string>) {
  return hashString(JSON.stringify(sortStringRecord(files))).slice(0, 16);
}

export function buildDashboardStateContentHash(state: DashboardSharedStateV1) {
  const { updatedAt, ...stableState } = state;
  void updatedAt;
  return hashString(JSON.stringify(stableState));
}

export function buildDashboardSharedState(
  source: DashboardPublishSource,
  shareId: string,
  updatedAt = new Date().toISOString(),
): DashboardSharedStateV1 {
  return {
    version: "v1",
    shareId,
    dashboardId: source.dashboardId,
    title: source.title,
    updatedAt,
    viewport: source.viewport,
    textBlocks: source.textBlocks.map((textBlock) => ({
      id: textBlock.id,
      text: textBlock.text,
      fontSize: textBlock.fontSize,
      layout: textBlock.layout,
    })),
    widgets: source.widgets.map((widget) => {
      const files = sortStringRecord(widget.files);
      return {
        sourceWidgetId: widget.id,
        publishedWidgetId: getPublishedWidgetId(shareId, widget.id),
        revision: buildWidgetRevision(files),
        title: widget.title,
        description: widget.description,
        layout: widget.layout,
        files,
      };
    }),
  };
}

export function loadDashboardPublishSource(dashboardId: string): DashboardPublishSource {
  const dashboard = getDashboard(dashboardId);
  if (!dashboard) {
    throw new Error(`Dashboard not found: ${dashboardId}`);
  }

  const widgetIds = parseStringArray(dashboard.widgetIdsJson);
  const textBlockIds = parseStringArray(dashboard.textBlockIdsJson);

  const widgets = widgetIds.flatMap((widgetId) => {
    const widget = getWidget(widgetId);
    if (!widget) {
      return [];
    }

    return [{
      id: widget.id,
      title: widget.title,
      description: widget.description,
      layout: parseLayout(widget.layoutJson, { x: 0, y: 0, w: 4, h: 3 }),
      files: getWidgetFiles(widgetId),
    }];
  });

  const textBlocks = textBlockIds.flatMap((textBlockId) => {
    const textBlock = getTextBlock(textBlockId);
    if (!textBlock) {
      return [];
    }

    return [{
      id: textBlock.id,
      text: textBlock.text,
      fontSize: textBlock.fontSize,
      layout: parseLayout(textBlock.layoutJson, { x: 0, y: 0, w: 3, h: 1 }),
    }];
  });

  return {
    dashboardId: dashboard.id,
    title: dashboard.title,
    viewport: parseViewport(dashboard.viewportJson),
    widgets,
    textBlocks,
  };
}

export async function materializePublishedWidgets(
  state: DashboardSharedStateV1,
  {
    waitForBuild,
  }: {
    waitForBuild: boolean;
  },
) {
  for (const widget of state.widgets) {
    const code = widget.files["src/App.tsx"] ?? null;
    const existingPublishedWidget = getWidget(widget.publishedWidgetId);
    const nextFilesJson = JSON.stringify(widget.files);
    const filesChanged = existingPublishedWidget?.filesJson !== nextFilesJson;

    upsertWidget({
      id: widget.publishedWidgetId,
      title: widget.title,
      description: widget.description,
      code,
      filesJson: nextFilesJson,
      layoutJson: JSON.stringify(widget.layout),
      messagesJson: JSON.stringify([]),
    });

    if (!filesChanged || !code) {
      continue;
    }

    if (waitForBuild) {
      await buildWidget(widget.publishedWidgetId);
    } else {
      rebuildWidget(widget.publishedWidgetId).catch((err) => {
        console.error(`[share-session] Failed to rebuild ${widget.publishedWidgetId}:`, err);
      });
    }
  }
}
