import { useWidgetStore } from "@/store/widget-store";
import { DEFAULT_CANVAS_VIEWPORT } from "@/lib/canvas-viewport";

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSync: Promise<void> | null = null;

type WidgetStoreSnapshot = ReturnType<typeof useWidgetStore.getState>;
type DurableWidgetStoreSnapshot = Pick<
  WidgetStoreSnapshot,
  "dashboards" | "widgets" | "textBlocks" | "viewports"
>;

export function buildSyncPayload() {
  const { dashboards, widgets, textBlocks, viewports } = useWidgetStore.getState();

  return {
    dashboards: dashboards.map((dashboard) => ({
      id: dashboard.id,
      title: dashboard.title,
      widgetIds: dashboard.widgetIds,
      textBlockIds: dashboard.textBlockIds ?? [],
      createdAt: dashboard.createdAt,
      viewport: viewports[dashboard.id] ?? DEFAULT_CANVAS_VIEWPORT,
    })),
    widgets: widgets.map((widget) => ({
      id: widget.id,
      title: widget.title,
      description: widget.description,
      code: widget.code,
      files: widget.files,
      layout: widget.layout,
      messages: widget.messages,
    })),
    textBlocks: textBlocks.map((textBlock) => ({
      id: textBlock.id,
      text: textBlock.text,
      fontSize: textBlock.fontSize,
      layout: textBlock.layout,
    })),
  };
}

async function syncNow() {
  const payload = buildSyncPayload();

  const syncRequest = (async () => {
    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Sync failed with status ${response.status}`);
    }
  })();

  pendingSync = syncRequest;
  try {
    await syncRequest;
  } finally {
    if (pendingSync === syncRequest) {
      pendingSync = null;
    }
  }
}

export function hasDurableStoreStateChanged(
  currentState: DurableWidgetStoreSnapshot,
  previousState: DurableWidgetStoreSnapshot,
) {
  return currentState.dashboards !== previousState.dashboards
    || currentState.widgets !== previousState.widgets
    || currentState.textBlocks !== previousState.textBlocks
    || currentState.viewports !== previousState.viewports;
}

export function scheduleSyncToServer() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    syncNow().catch(() => {});
  }, 2000);
}

export async function flushSyncToServer() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  if (pendingSync) {
    await pendingSync;
  }

  await syncNow();
}

export function deleteWidgetFromDb(widgetId: string) {
  fetch("/api/widgets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: widgetId }),
  }).catch(() => {});
}

export function deleteTextBlockFromDb(textBlockId: string) {
  fetch("/api/text-blocks", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: textBlockId }),
  }).catch(() => {});
}
