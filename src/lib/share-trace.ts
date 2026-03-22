import { randomUUID } from "node:crypto";
import { getDashboardByWidgetId, getWidget } from "@/db/widgets";
import { lookupPublishedDashboardSnapshot } from "@/lib/publish-dashboard";
import {
  getOptionalRiverrunClient,
  getRequiredRiverrunClient,
} from "@/lib/riverrun";
import {
  getPublishedWidgetId,
  getTraceStreamId,
  SHARE_BUCKET,
  deriveShareId,
} from "@/lib/share";
import {
  isPublishedDashboardTraceV1,
  isPublishedTraceEventV1,
  type PublishedDashboardTraceV1,
  type PublishedTraceEventKind,
  type PublishedTraceEventV1,
} from "@/lib/share-types";

const TRACE_EVENT_LIMIT = 500;
const TRACE_LIVE_FLUSH_MS = 200;
const TRACE_RETRY_MAX_FLUSH_MS = 10_000;
const traceWriteLocks = new Map<string, Promise<void>>();
const traceStreamEnsures = new Map<string, Promise<void>>();

export type PublishedTraceLookupResult =
  | {
      status: "ready";
      trace: PublishedDashboardTraceV1;
    }
  | {
      status: "backend_unavailable";
      message: string;
    };

export type PublishedTraceBootstrapResult =
  | {
      status: "ready";
      trace: PublishedDashboardTraceV1;
      nextOffset: string | null;
    }
  | {
      status: "backend_unavailable";
      message: string;
    };

export interface PublishedTraceRecorder {
  shareId: string;
  publishedWidgetId: string;
  widgetTitle: string;
  record: (
    kind: PublishedTraceEventKind,
    detail: string,
    extra?: {
      toolName?: string;
      path?: string;
      at?: string;
    },
  ) => void;
  flush: () => Promise<void>;
}

export function buildEmptyPublishedDashboardTrace(
  shareId: string,
  updatedAt = new Date().toISOString(),
  nextOffset: string | null = null,
): PublishedDashboardTraceV1 {
  return {
    version: "v1",
    shareId,
    updatedAt,
    nextOffset,
    events: [],
  };
}

export async function ensurePublishedTraceStream(shareId: string) {
  const existing = traceStreamEnsures.get(shareId);
  if (existing) {
    return existing;
  }

  const ensureTask = (async () => {
    const riverrun = getRequiredRiverrunClient();
    await riverrun.createStream(SHARE_BUCKET, getTraceStreamId(shareId));
  })();

  traceStreamEnsures.set(shareId, ensureTask);

  try {
    await ensureTask;
  } catch (err) {
    if (traceStreamEnsures.get(shareId) === ensureTask) {
      traceStreamEnsures.delete(shareId);
    }
    throw err;
  }
}

function normalizePublishedDashboardTrace(
  trace: PublishedDashboardTraceV1,
): PublishedDashboardTraceV1 {
  return {
    ...trace,
    nextOffset: trace.nextOffset ?? null,
  };
}

async function readCurrentPublishedDashboardTrace(shareId: string) {
  const riverrun = getRequiredRiverrunClient();
  const snapshot = await riverrun.getLatestSnapshot<unknown>(
    SHARE_BUCKET,
    getTraceStreamId(shareId),
  );

  if (!snapshot) {
    return buildEmptyPublishedDashboardTrace(shareId);
  }

  if (!isPublishedDashboardTraceV1(snapshot)) {
    throw new Error("Published trace snapshot is invalid");
  }

  return normalizePublishedDashboardTrace(snapshot);
}

export function mergePublishedTraceEvents(
  currentTrace: PublishedDashboardTraceV1,
  events: PublishedTraceEventV1[],
  nextOffset = currentTrace.nextOffset ?? null,
): PublishedDashboardTraceV1 {
  if (events.length === 0) {
    return {
      ...currentTrace,
      nextOffset,
    };
  }

  const lastEvent = events[events.length - 1];
  return {
    version: "v1",
    shareId: currentTrace.shareId,
    updatedAt: lastEvent.at,
    nextOffset,
    events: [...currentTrace.events, ...events].slice(-TRACE_EVENT_LIMIT),
  };
}

export async function lookupPublishedDashboardTrace(
  shareId: string,
): Promise<PublishedTraceLookupResult> {
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
      getTraceStreamId(shareId),
    );

    if (!snapshot) {
      return {
        status: "ready",
        trace: buildEmptyPublishedDashboardTrace(shareId),
      };
    }

    if (!isPublishedDashboardTraceV1(snapshot)) {
      return {
        status: "backend_unavailable",
        message: "Published trace snapshot is invalid",
      };
    }

    return {
      status: "ready",
      trace: normalizePublishedDashboardTrace(snapshot),
    };
  } catch (err) {
    return {
      status: "backend_unavailable",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function bootstrapPublishedDashboardTrace(
  shareId: string,
): Promise<PublishedTraceBootstrapResult> {
  const riverrun = getOptionalRiverrunClient();
  if (!riverrun) {
    return {
      status: "backend_unavailable",
      message: "RIVERRUN_BASE_URL is not configured",
    };
  }

  try {
    const bootstrap = await riverrun.bootstrap(
      SHARE_BUCKET,
      getTraceStreamId(shareId),
    );

    if (!bootstrap) {
      return {
        status: "ready",
        trace: buildEmptyPublishedDashboardTrace(shareId),
        nextOffset: "now",
      };
    }

    const [snapshotPart, ...updateParts] = bootstrap.parts;
    let trace = buildEmptyPublishedDashboardTrace(
      shareId,
      new Date().toISOString(),
      bootstrap.nextOffset,
    );

    if (snapshotPart?.body.trim()) {
      let parsedSnapshot: unknown;

      try {
        parsedSnapshot = JSON.parse(snapshotPart.body);
      } catch {
        return {
          status: "backend_unavailable",
          message: "Published trace bootstrap snapshot is invalid JSON",
        };
      }

      if (!isPublishedDashboardTraceV1(parsedSnapshot)) {
        return {
          status: "backend_unavailable",
          message: "Published trace bootstrap snapshot is invalid",
        };
      }

      trace = {
        ...normalizePublishedDashboardTrace(parsedSnapshot),
        nextOffset: parsedSnapshot.nextOffset ?? bootstrap.snapshotOffset ?? null,
      };
    }

    const retainedEvents: PublishedTraceEventV1[] = [];
    for (const part of updateParts) {
      const body = part.body.trim();
      if (!body) {
        continue;
      }

      let parsedEvent: unknown;
      try {
        parsedEvent = JSON.parse(body);
      } catch {
        return {
          status: "backend_unavailable",
          message: "Published trace bootstrap update is invalid JSON",
        };
      }

      if (!isPublishedTraceEventV1(parsedEvent)) {
        return {
          status: "backend_unavailable",
          message: "Published trace bootstrap update is invalid",
        };
      }

      retainedEvents.push(parsedEvent);
    }

    if (retainedEvents.length > 0) {
      trace = mergePublishedTraceEvents(
        trace,
        retainedEvents,
        bootstrap.nextOffset ?? trace.nextOffset ?? null,
      );
    } else {
      trace = {
        ...trace,
        nextOffset: bootstrap.nextOffset ?? trace.nextOffset ?? null,
      };
    }

    return {
      status: "ready",
      trace,
      nextOffset: bootstrap.nextOffset ?? trace.nextOffset ?? "now",
    };
  } catch (err) {
    return {
      status: "backend_unavailable",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function appendPublishedTraceEventsLocked(events: PublishedTraceEventV1[]) {
  if (events.length === 0) {
    return;
  }

  const riverrun = getRequiredRiverrunClient();
  const shareId = events[0].shareId;
  const streamId = getTraceStreamId(shareId);
  const currentTrace = await readCurrentPublishedDashboardTrace(shareId);

  let nextOffset: string | null = null;
  for (const event of events) {
    const appendResult = await riverrun.appendJson(
      SHARE_BUCKET,
      streamId,
      event,
    );
    nextOffset = appendResult.nextOffset;
  }

  if (!nextOffset) {
    return;
  }

  const nextTrace = mergePublishedTraceEvents(currentTrace, events, nextOffset);

  await riverrun.publishSnapshot(
    SHARE_BUCKET,
    streamId,
    nextOffset,
    JSON.stringify(nextTrace),
  );
}

export async function appendPublishedTraceEvents(events: PublishedTraceEventV1[]) {
  if (events.length === 0) {
    return;
  }

  const shareId = events[0].shareId;
  const previous = traceWriteLocks.get(shareId) ?? Promise.resolve();
  const writeTask = previous
    .catch(() => {})
    .then(() => appendPublishedTraceEventsLocked(events));

  traceWriteLocks.set(
    shareId,
    writeTask.then(
      () => undefined,
      () => undefined,
    ),
  );

  return writeTask;
}

export async function maybeCreatePublishedTraceRecorder(
  widgetId: string,
): Promise<PublishedTraceRecorder | null> {
  const widget = getWidget(widgetId);
  if (!widget) {
    return null;
  }

  const dashboard = getDashboardByWidgetId(widgetId);
  if (!dashboard) {
    return null;
  }

  const shareId = deriveShareId(dashboard.id);
  const publishedSnapshot = await lookupPublishedDashboardSnapshot(shareId);
  if (publishedSnapshot.status !== "ready") {
    return null;
  }

  await ensurePublishedTraceStream(shareId);

  const publishedWidgetId = getPublishedWidgetId(shareId, widgetId);
  const runId = randomUUID();
  const bufferedEvents: PublishedTraceEventV1[] = [];
  let flushTask: Promise<void> | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let consecutiveFlushFailures = 0;

  const scheduleFlush = (delayMs = TRACE_LIVE_FLUSH_MS) => {
    if (flushTask || flushTimer || bufferedEvents.length === 0) {
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
      while (bufferedEvents.length > 0) {
        const eventsToFlush = bufferedEvents.splice(0, bufferedEvents.length);

        try {
          await appendPublishedTraceEvents(eventsToFlush);
          consecutiveFlushFailures = 0;
        } catch (err) {
          consecutiveFlushFailures += 1;
          bufferedEvents.unshift(...eventsToFlush);
          throw err;
        }
      }
    })()
      .catch((err) => {
        console.error("[share-trace] Failed to append trace events:", err);
      })
      .finally(() => {
        flushTask = null;
        const retryDelayMs = consecutiveFlushFailures === 0
          ? TRACE_LIVE_FLUSH_MS
          : Math.min(
            TRACE_LIVE_FLUSH_MS * (2 ** consecutiveFlushFailures),
            TRACE_RETRY_MAX_FLUSH_MS,
          );
        scheduleFlush(retryDelayMs);
      });

    return flushTask;
  };

  return {
    shareId,
    publishedWidgetId,
    widgetTitle: widget.title,
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

      bufferedEvents.push(event);
      scheduleFlush();
    },
    flush() {
      return flushNow();
    },
  };
}
