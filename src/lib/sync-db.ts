export interface SyncDashboardPayload {
  id: string;
  title: string;
  widgetIds: string[];
  textBlockIds: string[];
  createdAt: number;
  viewport: unknown;
}

export interface SyncWidgetPayload {
  id: string;
  title: string;
  description: string;
  code: string | null;
  files: Record<string, string>;
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
}

export type SyncUrgency = "interactive" | "background";

const SYNC_DELAY_MS: Record<SyncUrgency, number> = {
  interactive: 250,
  background: 2000,
};

let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let scheduledSyncUrgency: SyncUrgency | null = null;
let syncLoopTask: Promise<void> | null = null;
let pendingResync = false;
let getSyncPayload: (() => SyncPayload) | null = null;

function readSyncPayload() {
  if (!getSyncPayload) {
    throw new Error("Sync payload provider is not configured");
  }

  return getSyncPayload();
}

async function syncNow() {
  const payload = readSyncPayload();

  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Sync failed with status ${response.status}`);
  }
}

export function configureSyncPayloadProvider(provider: () => SyncPayload) {
  getSyncPayload = provider;
}

async function runSyncLoop() {
  try {
    do {
      pendingResync = false;
      await syncNow();
    } while (pendingResync);
  } finally {
    syncLoopTask = null;
  }
}

function requestSync(forceAnotherPass = false) {
  if (syncLoopTask) {
    if (forceAnotherPass) {
      pendingResync = true;
    }
    return syncLoopTask;
  }

  syncLoopTask = runSyncLoop();
  return syncLoopTask;
}

export function scheduleSyncToServer(urgency: SyncUrgency = "background") {
  if (syncTimeout && urgency === "background" && scheduledSyncUrgency === "interactive") {
    return;
  }

  if (syncTimeout) {
    clearTimeout(syncTimeout);
  }

  scheduledSyncUrgency = urgency;
  syncTimeout = setTimeout(() => {
    syncTimeout = null;
    scheduledSyncUrgency = null;
    requestSync(syncLoopTask !== null).catch(() => {});
  }, SYNC_DELAY_MS[urgency]);
}

export async function flushSyncToServer() {
  if (syncTimeout) {
    clearTimeout(syncTimeout);
    syncTimeout = null;
    scheduledSyncUrgency = null;
  }

  await requestSync(syncLoopTask !== null);
}
