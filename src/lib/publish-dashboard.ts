import {
  getDashboard,
  getTextBlock,
  getWidget,
  getWidgetFiles,
  upsertWidget,
} from "@/db/widgets";
import { buildWidget } from "@/lib/widget-runner";
import {
  deriveShareId,
  getPublishedWidgetId,
  getSnapshotStreamId,
  getTraceStreamId,
  SHARE_BUCKET,
} from "@/lib/share";
import {
  getRequiredRiverrunClient,
  getOptionalRiverrunClient,
} from "@/lib/riverrun";
import {
  isPublishedDashboardSnapshotV1,
  type PublishedCanvasLayout,
  type PublishedDashboardSnapshotV1,
} from "@/lib/share-types";

export type PublishedDashboardLookupResult =
  | {
      status: "ready";
      snapshot: PublishedDashboardSnapshotV1;
    }
  | {
      status: "unpublished";
    }
  | {
      status: "backend_unavailable";
      message: string;
    };

interface PublishDashboardResult {
  shareId: string;
  snapshot: PublishedDashboardSnapshotV1;
  snapshotStreamId: string;
  traceStreamId: string;
}

const publishLocks = new Map<string, Promise<PublishDashboardResult>>();

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

export function buildPublishedDashboardSnapshot(
  source: DashboardPublishSource,
  shareId: string,
  publishedAt = new Date().toISOString(),
): PublishedDashboardSnapshotV1 {
  return {
    version: "v1",
    shareId,
    dashboardId: source.dashboardId,
    title: source.title,
    publishedAt,
    textBlocks: source.textBlocks.map((textBlock) => ({
      id: textBlock.id,
      text: textBlock.text,
      fontSize: textBlock.fontSize,
      layout: textBlock.layout,
    })),
    widgets: source.widgets.map((widget) => ({
      sourceWidgetId: widget.id,
      publishedWidgetId: getPublishedWidgetId(shareId, widget.id),
      title: widget.title,
      description: widget.description,
      layout: widget.layout,
      files: { ...widget.files },
    })),
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
    widgets,
    textBlocks,
  };
}

export async function materializePublishedWidgets(snapshot: PublishedDashboardSnapshotV1) {
  for (const widget of snapshot.widgets) {
    const code = widget.files["src/App.tsx"] ?? null;

    upsertWidget({
      id: widget.publishedWidgetId,
      title: widget.title,
      description: widget.description,
      code,
      filesJson: JSON.stringify(widget.files),
      layoutJson: JSON.stringify(widget.layout),
      messagesJson: JSON.stringify([]),
    });
  }

  // Publish should not fan out multiple concurrent widget builds at once.
  for (const widget of snapshot.widgets) {
    if (widget.files["src/App.tsx"]) {
      await buildWidget(widget.publishedWidgetId);
    }
  }
}

async function doPublishDashboard(dashboardId: string): Promise<PublishDashboardResult> {
  const shareId = deriveShareId(dashboardId);
  const source = loadDashboardPublishSource(dashboardId);
  const snapshot = buildPublishedDashboardSnapshot(source, shareId);
  const snapshotStreamId = getSnapshotStreamId(shareId);
  const traceStreamId = getTraceStreamId(shareId);

  await materializePublishedWidgets(snapshot);

  const riverrun = getRequiredRiverrunClient();
  await riverrun.createStream(SHARE_BUCKET, snapshotStreamId);

  const { body, nextOffset } = await riverrun.appendJson(
    SHARE_BUCKET,
    snapshotStreamId,
    snapshot,
  );

  await riverrun.publishSnapshot(
    SHARE_BUCKET,
    snapshotStreamId,
    nextOffset,
    body,
  );

  return {
    shareId,
    snapshot,
    snapshotStreamId,
    traceStreamId,
  };
}

export async function publishDashboard(dashboardId: string) {
  const existing = publishLocks.get(dashboardId);
  if (existing) {
    return existing;
  }

  const publishTask = doPublishDashboard(dashboardId);
  publishLocks.set(dashboardId, publishTask);

  try {
    return await publishTask;
  } finally {
    if (publishLocks.get(dashboardId) === publishTask) {
      publishLocks.delete(dashboardId);
    }
  }
}

export async function lookupPublishedDashboardSnapshot(
  shareId: string,
): Promise<PublishedDashboardLookupResult> {
  const riverrun = getOptionalRiverrunClient();
  if (!riverrun) {
    return {
      status: "backend_unavailable",
      message: "RIVERRUN_BASE_URL is not configured",
    };
  }

  try {
    const snapshot = await riverrun.getLatestSnapshot<unknown>(
      SHARE_BUCKET,
      getSnapshotStreamId(shareId),
    );

    if (!snapshot) {
      return { status: "unpublished" };
    }

    if (!isPublishedDashboardSnapshotV1(snapshot)) {
      return {
        status: "backend_unavailable",
        message: "Published snapshot is invalid",
      };
    }

    return {
      status: "ready",
      snapshot,
    };
  } catch (err) {
    return {
      status: "backend_unavailable",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function getPublishedDashboardSnapshot(shareId: string) {
  const result = await lookupPublishedDashboardSnapshot(shareId);
  return result.status === "ready" ? result.snapshot : null;
}
