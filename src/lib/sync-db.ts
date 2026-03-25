import type { CanvasViewport } from "@/store/widget-store";

export interface SyncDashboardPayload {
  id: string;
  title: string;
  widgetIds: string[];
  textBlockIds: string[];
  createdAt: number;
  viewport?: CanvasViewport;
}

export interface SyncWidgetPayload {
  id: string;
  title: string;
  description: string;
  code: string | null;
  files?: Record<string, string>;
  layout: unknown;
  messages: unknown[];
}

export interface SyncTextBlockPayload {
  id: string;
  text: string;
  fontSize: number;
  layout: unknown;
}

export interface SyncPayload {
  dashboards: SyncDashboardPayload[];
  widgets: SyncWidgetPayload[];
  textBlocks: SyncTextBlockPayload[];
  dirtyDashboardIds?: string[];
}

export type SyncUrgency = "interactive" | "background";

const DEBOUNCE_INTERACTIVE = 250;
const DEBOUNCE_BACKGROUND = 2000;

let payloadProvider: (() => SyncPayload) | null = null;
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let currentUrgency: SyncUrgency = "background";
let syncLoopTask: Promise<void> | null = null;
const pendingDirtyDashboardIds = new Set<string>();
let pendingResync = false;

export function configureSyncPayloadProvider(provider: () => SyncPayload) {
  payloadProvider = provider;
}

function getDelay(urgency: SyncUrgency) {
  return urgency === "interactive" ? DEBOUNCE_INTERACTIVE : DEBOUNCE_BACKGROUND;
}

async function syncNow() {
  if (!payloadProvider) return;
  const dirtyIds = [...pendingDirtyDashboardIds];
  pendingDirtyDashboardIds.clear();
  pendingResync = false;

  const payload = payloadProvider();
  payload.dirtyDashboardIds = dirtyIds.length > 0 ? dirtyIds : undefined;

  try {
    await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    for (const id of dirtyIds) pendingDirtyDashboardIds.add(id);
  }
}

async function runSyncLoop() {
  await syncNow();
  while (pendingResync) {
    await syncNow();
  }
  syncLoopTask = null;
}

function triggerSync() {
  if (syncLoopTask) {
    pendingResync = true;
    return;
  }
  syncLoopTask = runSyncLoop();
}

export function scheduleSyncToServer(options?: {
  urgency?: SyncUrgency;
  dirtyDashboardIds?: string[];
}) {
  const urgency = options?.urgency ?? "background";
  for (const id of options?.dirtyDashboardIds ?? []) {
    pendingDirtyDashboardIds.add(id);
  }

  if (syncTimeout && urgency === "interactive" && currentUrgency === "background") {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }

  if (!syncTimeout) {
    currentUrgency = urgency;
    syncTimeout = setTimeout(() => {
      syncTimeout = null;
      triggerSync();
    }, getDelay(urgency));
  }
}

export function deleteWidgetFromDb(_widgetId: string) {
  scheduleSyncToServer();
}

export function deleteTextBlockFromDb(_textBlockId: string) {
  scheduleSyncToServer();
}

export function syncWidgetToDb() {
  scheduleSyncToServer();
}

export async function flushSyncToServer(options?: { dirtyDashboardIds?: string[] }) {
  for (const id of options?.dirtyDashboardIds ?? []) {
    pendingDirtyDashboardIds.add(id);
  }
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
  }
  if (syncLoopTask) {
    pendingResync = true;
    await syncLoopTask;
  }
  await syncNow();
}
