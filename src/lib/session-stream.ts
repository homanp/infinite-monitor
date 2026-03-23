import { createHash, randomUUID } from "node:crypto";
import { getDashboardByWidgetId, getWidget } from "@/db/widgets";
import {
  buildDashboardSharedState,
  buildDashboardStateContentHash,
  loadDashboardPublishSource,
  materializePublishedWidgets,
} from "@/lib/shared-dashboard-state";
import {
  getOptionalRiverrunClient,
  getRequiredRiverrunClient,
} from "@/lib/riverrun";
import {
  deriveShareId,
  getPublishedWidgetId,
  getSessionStreamId,
  SHARE_BUCKET,
} from "@/lib/share";
import {
  applySharedSessionEvent,
  buildEmptySharedSessionSnapshot,
  buildEmptySharedSessionState,
  isSharedSessionEventV1,
  isSharedSessionSnapshotV1,
  normalizeSharedSessionState,
  type DashboardSharedStateV1,
  type PublishedTraceEventKind,
  type PublishedTraceEventV1,
  type SharedDashboardStateEventV1,
  type SharedSessionPresenceEventV1,
  type SharedSessionSnapshotV1,
  type SharedSessionStateV1,
  type SharedTraceEventEnvelopeV1,
} from "@/lib/share-types";

const SESSION_LIVE_APPEND_MS = 250;
const SESSION_LIVE_FLUSH_MS = 200;
const SESSION_RETRY_MAX_FLUSH_MS = 10_000;
const SESSION_SNAPSHOT_COMPACT_INTERVAL = 25;

const sessionWriteLocks = new Map<string, Promise<void>>();
const sessionStreamEnsures = new Map<string, Promise<void>>();
const knownDashboardStateHashes = new Map<string, string | null>();
const knownSessionStates = new Map<string, SharedSessionStateV1 | null>();
const sessionEventsSinceCompaction = new Map<string, number>();
const liveAppendTimers = new Map<string, ReturnType<typeof setTimeout>>();

export type SharedSessionBootstrapResult =
  | {
      status: "ready";
      snapshot: SharedSessionSnapshotV1;
      nextOffset: string | null;
    }
  | {
      status: "unavailable";
    }
  | {
      status: "backend_unavailable";
      message: string;
    };

export interface SharedDashboardAppendResult {
  shareId: string;
  state: DashboardSharedStateV1;
  nextOffset: string | null;
  skipped: boolean;
}

export interface SharedSessionRecorder {
  shareId: string;
  dashboardId: string;
  publishedWidgetId: string;
  widgetTitle: string;
  startRun: (at?: string) => void;
  record: (
    kind: PublishedTraceEventKind,
    detail: string,
    extra?: {
      toolName?: string;
      path?: string;
      at?: string;
    },
  ) => void;
  finish: (at?: string) => void;
  flush: () => Promise<void>;
}

interface SharedSessionBootstrapData {
  snapshot: SharedSessionSnapshotV1;
  nextOffset: string | null;
}

interface PendingDashboardStateWrite {
  kind: "dashboard.state";
  event: SharedDashboardStateEventV1;
  stateHash: string;
  forceAppend?: boolean;
}

interface PendingSessionPresenceWrite {
  kind: "session.presence";
  dashboardId: string;
  at: string;
  apply: (current: SharedSessionStateV1) => SharedSessionStateV1;
}

interface PendingTraceEventWrite {
  kind: "trace.event";
  event: SharedTraceEventEnvelopeV1;
}

type PendingSessionWrite =
  | PendingDashboardStateWrite
  | PendingSessionPresenceWrite
  | PendingTraceEventWrite;

function hashString(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function buildSessionStateContentHash(state: SharedSessionStateV1) {
  const { updatedAt, ...stableState } = normalizeSharedSessionState(state);
  void updatedAt;
  return hashString(JSON.stringify(stableState));
}

function buildSharedDashboardStateEvent(
  state: DashboardSharedStateV1,
  stateHash = buildDashboardStateContentHash(state),
): SharedDashboardStateEventV1 {
  return {
    version: "v1",
    kind: "dashboard.state",
    shareId: state.shareId,
    dashboardId: state.dashboardId,
    at: state.updatedAt,
    stateHash,
    state,
  };
}

function buildSharedSessionPresenceEvent(
  shareId: string,
  dashboardId: string,
  state: SharedSessionStateV1,
): SharedSessionPresenceEventV1 {
  return {
    version: "v1",
    kind: "session.presence",
    shareId,
    dashboardId,
    at: state.updatedAt,
    state: normalizeSharedSessionState(state),
  };
}

function buildSharedTraceEventEnvelope(
  shareId: string,
  dashboardId: string,
  event: PublishedTraceEventV1,
): SharedTraceEventEnvelopeV1 {
  return {
    version: "v1",
    kind: "trace.event",
    shareId,
    dashboardId,
    at: event.at,
    event,
  };
}

function syncKnownSessionCaches(shareId: string, snapshot: SharedSessionSnapshotV1) {
  knownDashboardStateHashes.set(
    shareId,
    snapshot.dashboard ? buildDashboardStateContentHash(snapshot.dashboard) : null,
  );
  const normalizedSession = normalizeSharedSessionState(snapshot.session);
  knownSessionStates.set(shareId, normalizedSession);
}

async function ensureSessionStream(shareId: string) {
  const existing = sessionStreamEnsures.get(shareId);
  if (existing) {
    return existing;
  }

  const ensureTask = (async () => {
    const riverrun = getRequiredRiverrunClient();
    await riverrun.createStream(SHARE_BUCKET, getSessionStreamId(shareId));
  })();

  sessionStreamEnsures.set(shareId, ensureTask);

  try {
    await ensureTask;
  } catch (err) {
    if (sessionStreamEnsures.get(shareId) === ensureTask) {
      sessionStreamEnsures.delete(shareId);
    }
    throw err;
  }
}

async function withSessionWriteLock<T>(
  shareId: string,
  task: () => Promise<T>,
): Promise<T> {
  const previous = sessionWriteLocks.get(shareId) ?? Promise.resolve();
  const nextTask = previous.catch(() => {}).then(task);
  const nextLock = nextTask.then(
    () => undefined,
    () => undefined,
  );

  sessionWriteLocks.set(shareId, nextLock);

  try {
    return await nextTask;
  } finally {
    if (sessionWriteLocks.get(shareId) === nextLock) {
      sessionWriteLocks.delete(shareId);
    }
  }
}

function parseSharedSessionBootstrap(
  shareId: string,
  bootstrap: {
    nextOffset: string | null;
    parts: Array<{ body: string }>;
  },
): SharedSessionBootstrapData {
  const [snapshotPart, ...updateParts] = bootstrap.parts;
  let snapshot = buildEmptySharedSessionSnapshot(
    shareId,
    new Date().toISOString(),
  );

  if (snapshotPart?.body.trim()) {
    let parsedSnapshot: unknown;

    try {
      parsedSnapshot = JSON.parse(snapshotPart.body);
    } catch {
      throw new Error("Shared session bootstrap snapshot is invalid JSON");
    }

    if (!isSharedSessionSnapshotV1(parsedSnapshot)) {
      throw new Error("Shared session bootstrap snapshot is invalid");
    }

    snapshot = {
      ...parsedSnapshot,
      session: normalizeSharedSessionState(parsedSnapshot.session),
      trace: {
        ...parsedSnapshot.trace,
        nextOffset: parsedSnapshot.trace.nextOffset ?? null,
      },
    };
  }

  for (const part of updateParts) {
    const body = part.body.trim();
    if (!body) {
      continue;
    }

    let parsedEvent: unknown;
    try {
      parsedEvent = JSON.parse(body);
    } catch {
      throw new Error("Shared session bootstrap update is invalid JSON");
    }

    if (!isSharedSessionEventV1(parsedEvent)) {
      throw new Error("Shared session bootstrap update is invalid");
    }

    snapshot = applySharedSessionEvent(snapshot, parsedEvent);
  }

  snapshot = {
    ...snapshot,
    trace: {
      ...snapshot.trace,
      nextOffset: bootstrap.nextOffset ?? snapshot.trace.nextOffset ?? null,
    },
  };

  return {
    snapshot,
    nextOffset: bootstrap.nextOffset ?? snapshot.trace.nextOffset ?? null,
  };
}

async function loadSharedSessionFromBootstrap(
  shareId: string,
): Promise<SharedSessionBootstrapData | null> {
  const riverrun = getRequiredRiverrunClient();
  const bootstrap = await riverrun.bootstrap(
    SHARE_BUCKET,
    getSessionStreamId(shareId),
  );

  if (!bootstrap) {
    return null;
  }

  return parseSharedSessionBootstrap(shareId, bootstrap);
}

async function lookupCurrentDashboardStateHash(shareId: string) {
  if (knownDashboardStateHashes.has(shareId)) {
    return knownDashboardStateHashes.get(shareId) ?? null;
  }

  const bootstrap = await loadSharedSessionFromBootstrap(shareId);
  if (bootstrap) {
    syncKnownSessionCaches(shareId, bootstrap.snapshot);
  } else {
    knownDashboardStateHashes.set(shareId, null);
  }

  return knownDashboardStateHashes.get(shareId) ?? null;
}

async function lookupCurrentSessionState(shareId: string) {
  const existing = knownSessionStates.get(shareId);
  if (existing) {
    return existing;
  }

  const bootstrap = await loadSharedSessionFromBootstrap(shareId);
  if (bootstrap) {
    syncKnownSessionCaches(shareId, bootstrap.snapshot);
    return knownSessionStates.get(shareId) ?? bootstrap.snapshot.session;
  }

  const emptyState = buildEmptySharedSessionState(shareId);
  knownSessionStates.set(shareId, emptyState);
  return emptyState;
}

async function compactSharedSessionSnapshotLocked(shareId: string) {
  const session = await loadSharedSessionFromBootstrap(shareId);
  if (!session?.nextOffset) {
    return;
  }

  const riverrun = getRequiredRiverrunClient();
  await riverrun.publishSnapshot(
    SHARE_BUCKET,
    getSessionStreamId(shareId),
    session.nextOffset,
    JSON.stringify(session.snapshot),
  );

  syncKnownSessionCaches(shareId, session.snapshot);
  sessionEventsSinceCompaction.set(shareId, 0);
}

async function appendPendingSessionWritesLocked(
  shareId: string,
  writes: PendingSessionWrite[],
  {
    forceCompact = false,
  }: {
    forceCompact?: boolean;
  } = {},
) {
  if (writes.length === 0) {
    return {
      nextOffset: null,
      appendedCount: 0,
    };
  }

  await ensureSessionStream(shareId);

  const riverrun = getRequiredRiverrunClient();
  const streamId = getSessionStreamId(shareId);
  let nextOffset: string | null = null;
  let appendedCount = 0;
  let currentSessionState: SharedSessionStateV1 | null = null;

  for (const write of writes) {
    switch (write.kind) {
      case "dashboard.state": {
        if (!write.forceAppend) {
          const previousHash = await lookupCurrentDashboardStateHash(shareId);
          if (previousHash === write.stateHash) {
            continue;
          }
        }

        const appendResult = await riverrun.appendJson(
          SHARE_BUCKET,
          streamId,
          write.event,
        );
        nextOffset = appendResult.nextOffset;
        appendedCount += 1;
        knownDashboardStateHashes.set(shareId, write.stateHash);
        break;
      }

      case "session.presence": {
        const baseState: SharedSessionStateV1 = currentSessionState
          ?? await lookupCurrentSessionState(shareId);
        const nextState = normalizeSharedSessionState({
          ...write.apply(baseState),
          version: "v1",
          shareId,
          updatedAt: write.at,
        });
        const nextHash = buildSessionStateContentHash(nextState);
        const previousHash = buildSessionStateContentHash(baseState);

        if (nextHash === previousHash) {
          currentSessionState = baseState;
          continue;
        }

        const appendResult = await riverrun.appendJson(
          SHARE_BUCKET,
          streamId,
          buildSharedSessionPresenceEvent(
            shareId,
            write.dashboardId,
            nextState,
          ),
        );
        nextOffset = appendResult.nextOffset;
        appendedCount += 1;
        currentSessionState = nextState;
        knownSessionStates.set(shareId, nextState);
        break;
      }

      case "trace.event": {
        const appendResult = await riverrun.appendJson(
          SHARE_BUCKET,
          streamId,
          write.event,
        );
        nextOffset = appendResult.nextOffset;
        appendedCount += 1;
        break;
      }
    }
  }

  if (appendedCount === 0) {
    return {
      nextOffset: null,
      appendedCount: 0,
    };
  }

  const eventsSinceCompaction = sessionEventsSinceCompaction.get(shareId) ?? 0;
  const nextEventsSinceCompaction = eventsSinceCompaction + appendedCount;

  if (forceCompact || nextEventsSinceCompaction >= SESSION_SNAPSHOT_COMPACT_INTERVAL) {
    await compactSharedSessionSnapshotLocked(shareId);
  } else {
    sessionEventsSinceCompaction.set(shareId, nextEventsSinceCompaction);
  }

  return {
    nextOffset,
    appendedCount,
  };
}

async function appendPendingSessionWrites(
  shareId: string,
  writes: PendingSessionWrite[],
  options: {
    forceCompact?: boolean;
  } = {},
) {
  return withSessionWriteLock(
    shareId,
    () => appendPendingSessionWritesLocked(shareId, writes, options),
  );
}

export async function compactSharedSessionSnapshot(shareId: string) {
  return withSessionWriteLock(
    shareId,
    () => compactSharedSessionSnapshotLocked(shareId),
  );
}

export async function appendSharedDashboardState(
  dashboardId: string,
  {
    force = false,
    waitForBuild = false,
  }: {
    force?: boolean;
    waitForBuild?: boolean;
  } = {},
): Promise<SharedDashboardAppendResult> {
  const shareId = deriveShareId(dashboardId);
  const state = buildDashboardSharedState(
    loadDashboardPublishSource(dashboardId),
    shareId,
  );
  await materializePublishedWidgets(state, { waitForBuild });
  const stateHash = buildDashboardStateContentHash(state);

  return withSessionWriteLock(shareId, async () => {
    if (!force) {
      const previousHash = await lookupCurrentDashboardStateHash(shareId);
      if (previousHash === stateHash) {
        return {
          shareId,
          state,
          nextOffset: null,
          skipped: true,
        };
      }
    }

    const result = await appendPendingSessionWritesLocked(
      shareId,
      [{
        kind: "dashboard.state",
        event: buildSharedDashboardStateEvent(state, stateHash),
        stateHash,
      }],
    );

    return {
      shareId,
      state,
      nextOffset: result.nextOffset,
      skipped: false,
    };
  });
}

export function scheduleSharedDashboardAppend(
  dashboardId: string,
  delayMs = SESSION_LIVE_APPEND_MS,
) {
  const existingTimer = liveAppendTimers.get(dashboardId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    liveAppendTimers.delete(dashboardId);
    void appendSharedDashboardState(dashboardId).catch((err) => {
      console.error(`[share-session] Failed to append dashboard state for ${dashboardId}:`, err);
    });
  }, delayMs);

  liveAppendTimers.set(dashboardId, timer);
}

export function scheduleSharedDashboardAppendForWidget(
  widgetId: string,
  delayMs = SESSION_LIVE_APPEND_MS,
) {
  const dashboard = getDashboardByWidgetId(widgetId);
  if (!dashboard) {
    return;
  }

  scheduleSharedDashboardAppend(dashboard.id, delayMs);
}

export async function bootstrapSharedSession(
  shareId: string,
): Promise<SharedSessionBootstrapResult> {
  const riverrun = getOptionalRiverrunClient();

  try {
    const bootstrap = await riverrun.bootstrap(
      SHARE_BUCKET,
      getSessionStreamId(shareId),
    );

    if (!bootstrap) {
      return { status: "unavailable" };
    }

    const parsed = parseSharedSessionBootstrap(shareId, bootstrap);
    syncKnownSessionCaches(shareId, parsed.snapshot);

    if (!parsed.snapshot.dashboard) {
      return { status: "unavailable" };
    }

    return {
      status: "ready",
      snapshot: parsed.snapshot,
      nextOffset: parsed.nextOffset ?? "now",
    };
  } catch (err) {
    return {
      status: "backend_unavailable",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function maybeCreateSharedSessionRecorder(
  widgetId: string,
): Promise<SharedSessionRecorder | null> {
  const widget = getWidget(widgetId);
  if (!widget) {
    return null;
  }

  const dashboard = getDashboardByWidgetId(widgetId);
  if (!dashboard) {
    return null;
  }

  const shareId = deriveShareId(dashboard.id);
  await ensureSessionStream(shareId);

  const publishedWidgetId = getPublishedWidgetId(shareId, widgetId);
  const runId = randomUUID();
  const bufferedWrites: PendingSessionWrite[] = [];
  let flushTask: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFlushFailures = 0;
  let pendingCompaction = false;

  const scheduleFlush = (delayMs = SESSION_LIVE_FLUSH_MS) => {
    if (flushTask || flushTimer || (bufferedWrites.length === 0 && !pendingCompaction)) {
      return;
    }

    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushNow();
    }, delayMs);
  };

  const flushNow = () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }

    if (flushTask) {
      return flushTask;
    }

    flushTask = (async () => {
      while (bufferedWrites.length > 0) {
        const writesToFlush = bufferedWrites.splice(0, bufferedWrites.length);

        try {
          await appendPendingSessionWrites(shareId, writesToFlush, {
            forceCompact: pendingCompaction,
          });
          if (pendingCompaction) {
            pendingCompaction = false;
          }
          consecutiveFlushFailures = 0;
        } catch (err) {
          consecutiveFlushFailures += 1;
          bufferedWrites.unshift(...writesToFlush);
          throw err;
        }
      }

      if (pendingCompaction) {
        try {
          await compactSharedSessionSnapshot(shareId);
          pendingCompaction = false;
          consecutiveFlushFailures = 0;
        } catch (err) {
          consecutiveFlushFailures += 1;
          throw err;
        }
      }
    })()
      .catch((err) => {
        console.error("[share-session] Failed to flush shared session writes:", err);
      })
      .finally(() => {
        flushTask = null;
        const retryDelayMs = consecutiveFlushFailures === 0
          ? SESSION_LIVE_FLUSH_MS
          : Math.min(
            SESSION_LIVE_FLUSH_MS * (2 ** consecutiveFlushFailures),
            SESSION_RETRY_MAX_FLUSH_MS,
          );
        scheduleFlush(retryDelayMs);
      });

    return flushTask;
  };

  return {
    shareId,
    dashboardId: dashboard.id,
    publishedWidgetId,
    widgetTitle: widget.title,
    startRun(at = new Date().toISOString()) {
      try {
        const dashboardBaselineState = buildDashboardSharedState(
          loadDashboardPublishSource(dashboard.id),
          shareId,
          at,
        );
        const dashboardBaselineHash = buildDashboardStateContentHash(dashboardBaselineState);

        bufferedWrites.push({
          kind: "dashboard.state",
          event: buildSharedDashboardStateEvent(
            dashboardBaselineState,
            dashboardBaselineHash,
          ),
          stateHash: dashboardBaselineHash,
          forceAppend: true,
        });
      } catch (err) {
        console.error("[share-session] Failed to capture replay baseline dashboard state:", err);
      }

      bufferedWrites.push({
        kind: "session.presence",
        dashboardId: dashboard.id,
        at,
        apply(currentState) {
          const nextStreamingWidgetIds = Array.from(new Set([
            ...currentState.streamingWidgetIds,
            publishedWidgetId,
          ]));

          return {
            ...currentState,
            updatedAt: at,
            activeWidgetId: publishedWidgetId,
            streamingWidgetIds: nextStreamingWidgetIds,
            currentActions: {
              ...currentState.currentActions,
              [publishedWidgetId]: "Generating widget",
            },
          };
        },
      });
      scheduleFlush();
    },
    record(kind, detail, extra = {}) {
      const event: PublishedTraceEventV1 = {
        id: randomUUID(),
        runId,
        shareId,
        publishedWidgetId,
        widgetTitle: widget.title,
        kind,
        at: extra.at ?? new Date().toISOString(),
        detail,
        ...(extra.toolName ? { toolName: extra.toolName } : {}),
        ...(extra.path ? { path: extra.path } : {}),
      };

      if (kind === "run-finished" || kind === "run-abort" || kind === "run-error") {
        pendingCompaction = true;
      }

      bufferedWrites.push({
        kind: "trace.event",
        event: buildSharedTraceEventEnvelope(shareId, dashboard.id, event),
      });
      scheduleFlush();
    },
    finish(at = new Date().toISOString()) {
      bufferedWrites.push({
        kind: "session.presence",
        dashboardId: dashboard.id,
        at,
        apply(currentState) {
          const nextStreamingWidgetIds = currentState.streamingWidgetIds
            .filter((id) => id !== publishedWidgetId);
          const nextActions = { ...currentState.currentActions };
          delete nextActions[publishedWidgetId];

          return {
            ...currentState,
            updatedAt: at,
            activeWidgetId:
              currentState.activeWidgetId === publishedWidgetId
                ? nextStreamingWidgetIds.at(-1) ?? null
                : currentState.activeWidgetId,
            streamingWidgetIds: nextStreamingWidgetIds,
            currentActions: nextActions,
          };
        },
      });
      pendingCompaction = true;
      scheduleFlush();
    },
    flush() {
      pendingCompaction = true;
      return flushNow();
    },
  };
}
