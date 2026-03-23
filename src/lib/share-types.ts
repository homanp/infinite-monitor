import {
  isCanvasViewportSnapshot,
  type CanvasViewportSnapshot,
} from "@/lib/canvas-viewport";

export interface PublishedCanvasLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PublishedTextBlockSnapshotV1 {
  id: string;
  text: string;
  fontSize: number;
  layout: PublishedCanvasLayout;
}

export interface PublishedWidgetSnapshotV1 {
  sourceWidgetId: string;
  publishedWidgetId: string;
  revision: string;
  title: string;
  description: string;
  layout: PublishedCanvasLayout;
  files: Record<string, string>;
}

export interface DashboardSharedStateV1 {
  version: "v1";
  shareId: string;
  dashboardId: string;
  title: string;
  updatedAt: string;
  viewport?: CanvasViewportSnapshot | null;
  textBlocks: PublishedTextBlockSnapshotV1[];
  widgets: PublishedWidgetSnapshotV1[];
}

export type PublishedTraceEventKind =
  | "run-start"
  | "tool-call"
  | "file-written"
  | "run-finished"
  | "run-abort"
  | "run-error";

export interface PublishedTraceEventV1 {
  id: string;
  runId: string;
  shareId: string;
  publishedWidgetId: string;
  widgetTitle: string;
  kind: PublishedTraceEventKind;
  at: string;
  detail: string;
  toolName?: string;
  path?: string;
}

export interface PublishedDashboardTraceV1 {
  version: "v1";
  shareId: string;
  updatedAt: string;
  nextOffset?: string | null;
  events: PublishedTraceEventV1[];
}

export type SharedTraceStateV1 = PublishedDashboardTraceV1;

export interface SharedSessionStateV1 {
  version: "v1";
  shareId: string;
  updatedAt: string;
  activeWidgetId: string | null;
  streamingWidgetIds: string[];
  currentActions: Record<string, string>;
}

export interface SharedSessionSnapshotV1 {
  version: "v1";
  shareId: string;
  dashboard: DashboardSharedStateV1 | null;
  session: SharedSessionStateV1;
  trace: SharedTraceStateV1;
  replayEvents: SharedSessionEventV1[];
  updatedAt: string;
}

export interface SharedDashboardStateEventV1 {
  version: "v1";
  kind: "dashboard.state";
  shareId: string;
  dashboardId: string;
  at: string;
  stateHash: string;
  state: DashboardSharedStateV1;
}

export interface SharedSessionPresenceEventV1 {
  version: "v1";
  kind: "session.presence";
  shareId: string;
  dashboardId: string;
  at: string;
  state: SharedSessionStateV1;
}

export interface SharedTraceEventEnvelopeV1 {
  version: "v1";
  kind: "trace.event";
  shareId: string;
  dashboardId: string;
  at: string;
  event: PublishedTraceEventV1;
}

export type SharedSessionEventV1 =
  | SharedDashboardStateEventV1
  | SharedSessionPresenceEventV1
  | SharedTraceEventEnvelopeV1;

export interface SharedSessionReplayFrameV1 {
  traceEvent: PublishedTraceEventV1 | null;
  endEventIndex: number;
}

function sortStringArray(values: string[]) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function sortStringRecordEntries(
  value: Record<string, string>,
) {
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

export function buildEmptySharedTraceState(
  shareId: string,
  updatedAt = new Date().toISOString(),
  nextOffset: string | null = null,
): SharedTraceStateV1 {
  return {
    version: "v1",
    shareId,
    updatedAt,
    nextOffset,
    events: [],
  };
}

export function mergeSharedTraceEvents(
  currentTrace: SharedTraceStateV1,
  events: PublishedTraceEventV1[],
  nextOffset = currentTrace.nextOffset ?? null,
): SharedTraceStateV1 {
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
    events: [...currentTrace.events, ...events].slice(-500),
  };
}

export function normalizeSharedSessionState(
  state: SharedSessionStateV1,
): SharedSessionStateV1 {
  return {
    ...state,
    activeWidgetId: state.activeWidgetId ?? null,
    streamingWidgetIds: sortStringArray(
      Array.from(new Set(state.streamingWidgetIds)),
    ),
    currentActions: sortStringRecordEntries(state.currentActions),
  };
}

export function buildEmptySharedSessionState(
  shareId: string,
  updatedAt = new Date().toISOString(),
): SharedSessionStateV1 {
  return {
    version: "v1",
    shareId,
    updatedAt,
    activeWidgetId: null,
    streamingWidgetIds: [],
    currentActions: {},
  };
}

export function buildEmptySharedSessionSnapshot(
  shareId: string,
  updatedAt = new Date().toISOString(),
): SharedSessionSnapshotV1 {
  return {
    version: "v1",
    shareId,
    dashboard: null,
    session: buildEmptySharedSessionState(shareId, updatedAt),
    trace: buildEmptySharedTraceState(shareId, updatedAt),
    replayEvents: [],
    updatedAt,
  };
}

function reduceSharedSessionSlices(
  snapshot: SharedSessionSnapshotV1,
  event: SharedSessionEventV1,
): SharedSessionSnapshotV1 {
  switch (event.kind) {
    case "dashboard.state":
      return {
        ...snapshot,
        dashboard: event.state,
        updatedAt: event.at,
      };
    case "session.presence":
      return {
        ...snapshot,
        session: normalizeSharedSessionState(event.state),
        updatedAt: event.at,
      };
    case "trace.event":
      return {
        ...snapshot,
        trace: mergeSharedTraceEvents(snapshot.trace, [event.event]),
        updatedAt: event.at,
      };
  }
}

function findLastEventIndex(
  events: SharedSessionEventV1[],
  predicate: (event: SharedSessionEventV1) => boolean,
  endExclusive = events.length,
) {
  for (let index = endExclusive - 1; index >= 0; index -= 1) {
    if (predicate(events[index])) {
      return index;
    }
  }

  return -1;
}

export function trimSharedSessionReplayEvents(
  events: SharedSessionEventV1[],
  maxTraceEvents = 500,
) {
  if (events.length === 0) {
    return events;
  }

  const traceIndices = events.flatMap((event, index) => {
    return event.kind === "trace.event" ? [index] : [];
  });

  if (traceIndices.length === 0) {
    const lastDashboardIndex = findLastEventIndex(
      events,
      (event) => event.kind === "dashboard.state",
    );
    const lastSessionIndex = findLastEventIndex(
      events,
      (event) => event.kind === "session.presence",
    );
    const startIndex = [lastDashboardIndex, lastSessionIndex]
      .filter((index) => index >= 0)
      .sort((left, right) => left - right)[0];

    return startIndex === undefined ? events.slice(-1) : events.slice(startIndex);
  }

  const firstTraceIndexToKeep = traceIndices[Math.max(0, traceIndices.length - maxTraceEvents)];
  const latestRunStartIndex = findLastEventIndex(
    events,
    (event) => event.kind === "trace.event" && event.event.kind === "run-start",
  );
  const replayAnchorIndex = latestRunStartIndex >= 0
    ? latestRunStartIndex
    : firstTraceIndexToKeep;
  const lastDashboardBeforeAnchor = findLastEventIndex(
    events,
    (event) => event.kind === "dashboard.state",
    replayAnchorIndex,
  );
  const lastSessionBeforeAnchor = findLastEventIndex(
    events,
    (event) => event.kind === "session.presence",
    replayAnchorIndex,
  );
  const baselineStartIndex = [
    lastDashboardBeforeAnchor,
    lastSessionBeforeAnchor,
    replayAnchorIndex,
  ]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return baselineStartIndex === undefined
    ? events.slice(firstTraceIndexToKeep)
    : events.slice(baselineStartIndex);
}

export function buildSharedSessionReplayFrames(
  replayEvents: SharedSessionEventV1[],
): SharedSessionReplayFrameV1[] {
  const traceIndices = replayEvents.flatMap((event, index) => {
    return event.kind === "trace.event" ? [index] : [];
  });

  if (traceIndices.length === 0) {
    return [];
  }

  const frames: SharedSessionReplayFrameV1[] = [{
    traceEvent: null,
    endEventIndex: traceIndices[0],
  }];

  for (let traceIndex = 0; traceIndex < traceIndices.length; traceIndex += 1) {
    const eventIndex = traceIndices[traceIndex];
    const event = replayEvents[eventIndex];

    if (!event || event.kind !== "trace.event") {
      continue;
    }

    frames.push({
      traceEvent: event.event,
      endEventIndex: traceIndices[traceIndex + 1] ?? replayEvents.length,
    });
  }

  return frames;
}

export function buildSharedSessionReplaySnapshot(
  shareId: string,
  replayEvents: SharedSessionEventV1[],
  frameIndex: number,
): SharedSessionSnapshotV1 {
  const replayFrames = buildSharedSessionReplayFrames(replayEvents);
  if (replayFrames.length === 0) {
    return {
      ...buildEmptySharedSessionSnapshot(shareId),
      replayEvents,
    };
  }

  const safeFrameIndex = Math.max(0, Math.min(frameIndex, replayFrames.length - 1));
  const endEventIndex = replayFrames[safeFrameIndex]?.endEventIndex ?? replayEvents.length;
  let snapshot = buildEmptySharedSessionSnapshot(shareId);

  for (const event of replayEvents.slice(0, endEventIndex)) {
    snapshot = reduceSharedSessionSlices(snapshot, event);
  }

  return {
    ...snapshot,
    replayEvents,
  };
}

export function applySharedSessionEvent(
  snapshot: SharedSessionSnapshotV1,
  event: SharedSessionEventV1,
): SharedSessionSnapshotV1 {
  return {
    ...reduceSharedSessionSlices(snapshot, event),
    replayEvents: trimSharedSessionReplayEvents([
      ...snapshot.replayEvents,
      event,
    ]),
  };
}

function isCanvasLayout(value: unknown): value is PublishedCanvasLayout {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return ["x", "y", "w", "h"].every((key) => typeof candidate[key] === "number");
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => typeof entry === "string");
}

function isPublishedTraceEventKind(value: unknown): value is PublishedTraceEventKind {
  return value === "run-start"
    || value === "tool-call"
    || value === "file-written"
    || value === "run-finished"
    || value === "run-abort"
    || value === "run-error";
}

export function isPublishedTraceEventV1(value: unknown): value is PublishedTraceEventV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const traceEvent = value as Record<string, unknown>;
  const optionalToolName = traceEvent.toolName;
  const optionalPath = traceEvent.path;

  return (
    typeof traceEvent.id === "string"
    && typeof traceEvent.runId === "string"
    && typeof traceEvent.shareId === "string"
    && typeof traceEvent.publishedWidgetId === "string"
    && typeof traceEvent.widgetTitle === "string"
    && isPublishedTraceEventKind(traceEvent.kind)
    && typeof traceEvent.at === "string"
    && typeof traceEvent.detail === "string"
    && (optionalToolName === undefined || typeof optionalToolName === "string")
    && (optionalPath === undefined || typeof optionalPath === "string")
  );
}

export function isDashboardSharedStateV1(
  value: unknown,
): value is DashboardSharedStateV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== "v1"
    || typeof candidate.shareId !== "string"
    || typeof candidate.dashboardId !== "string"
    || typeof candidate.title !== "string"
    || typeof candidate.updatedAt !== "string"
    || (candidate.viewport !== undefined
      && candidate.viewport !== null
      && !isCanvasViewportSnapshot(candidate.viewport))
    || !Array.isArray(candidate.textBlocks)
    || !Array.isArray(candidate.widgets)
  ) {
    return false;
  }

  const textBlocksValid = candidate.textBlocks.every((textBlock) => {
    if (!textBlock || typeof textBlock !== "object") {
      return false;
    }

    const block = textBlock as Record<string, unknown>;
    return (
      typeof block.id === "string"
      && typeof block.text === "string"
      && typeof block.fontSize === "number"
      && isCanvasLayout(block.layout)
    );
  });

  if (!textBlocksValid) {
    return false;
  }

  return candidate.widgets.every((widget) => {
    if (!widget || typeof widget !== "object") {
      return false;
    }

    const publishedWidget = widget as Record<string, unknown>;
    return (
      typeof publishedWidget.sourceWidgetId === "string"
      && typeof publishedWidget.publishedWidgetId === "string"
      && typeof publishedWidget.revision === "string"
      && typeof publishedWidget.title === "string"
      && typeof publishedWidget.description === "string"
      && isCanvasLayout(publishedWidget.layout)
      && isStringRecord(publishedWidget.files)
    );
  });
}

export function isPublishedDashboardTraceV1(
  value: unknown,
): value is PublishedDashboardTraceV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== "v1"
    || typeof candidate.shareId !== "string"
    || typeof candidate.updatedAt !== "string"
    || (candidate.nextOffset !== undefined
      && candidate.nextOffset !== null
      && typeof candidate.nextOffset !== "string")
    || !Array.isArray(candidate.events)
  ) {
    return false;
  }

  return candidate.events.every((event) => {
    return isPublishedTraceEventV1(event);
  });
}

function isSharedSessionStateRecord(value: unknown): value is SharedSessionStateV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === "v1"
    && typeof candidate.shareId === "string"
    && typeof candidate.updatedAt === "string"
    && (candidate.activeWidgetId === null || typeof candidate.activeWidgetId === "string")
    && Array.isArray(candidate.streamingWidgetIds)
    && candidate.streamingWidgetIds.every((entry) => typeof entry === "string")
    && isStringRecord(candidate.currentActions)
  );
}

export function isSharedSessionStateV1(
  value: unknown,
): value is SharedSessionStateV1 {
  return isSharedSessionStateRecord(value);
}

export function isSharedSessionSnapshotV1(
  value: unknown,
): value is SharedSessionSnapshotV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === "v1"
    && typeof candidate.shareId === "string"
    && typeof candidate.updatedAt === "string"
    && (candidate.dashboard === null || isDashboardSharedStateV1(candidate.dashboard))
    && isSharedSessionStateRecord(candidate.session)
    && Array.isArray(candidate.replayEvents)
    && candidate.replayEvents.every((event) => isSharedSessionEventV1(event))
    && isPublishedDashboardTraceV1(candidate.trace)
  );
}

export function isSharedSessionEventV1(
  value: unknown,
): value is SharedSessionEventV1 {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  if (
    candidate.version !== "v1"
    || typeof candidate.shareId !== "string"
    || typeof candidate.dashboardId !== "string"
    || typeof candidate.at !== "string"
  ) {
    return false;
  }

  switch (candidate.kind) {
    case "dashboard.state":
      return (
        typeof candidate.stateHash === "string"
        && isDashboardSharedStateV1(candidate.state)
      );
    case "session.presence":
      return isSharedSessionStateRecord(candidate.state);
    case "trace.event":
      return isPublishedTraceEventV1(candidate.event);
    default:
      return false;
  }
}
