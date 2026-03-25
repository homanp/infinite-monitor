import { describe, expect, it } from "vitest";
import {
  applySharedSessionEvent,
  buildEmptySharedSessionSnapshot,
  buildSharedSessionReplayFrames,
  buildSharedSessionReplaySnapshot,
  findActiveSharedTraceEvent,
  findLatestSharedTraceEvent,
  SharedSessionEventV1Schema,
  type SharedDashboardStateEventV1,
  type SharedTraceEventEnvelopeV1,
  type PublishedTraceEventV1,
  type DashboardSharedStateV1,
} from "@/lib/share-types";

const SHARE_ID = "shr_test";

function makeDashboardState(overrides: Partial<DashboardSharedStateV1> = {}): DashboardSharedStateV1 {
  return { version: "v1", shareId: SHARE_ID, dashboardId: "dash-1", title: "Test", updatedAt: new Date().toISOString(), textBlocks: [], widgets: [], ...overrides };
}

function makeDashboardEvent(state?: DashboardSharedStateV1): SharedDashboardStateEventV1 {
  const s = state ?? makeDashboardState();
  return { version: "v1", kind: "dashboard.state", shareId: SHARE_ID, dashboardId: "dash-1", at: s.updatedAt, stateHash: "hash", state: s };
}

function makeTraceEvent(kind: PublishedTraceEventV1["kind"] = "tool-call", id = "ev-1"): SharedTraceEventEnvelopeV1 {
  return {
    version: "v1", kind: "trace.event", shareId: SHARE_ID, dashboardId: "dash-1", at: new Date().toISOString(),
    event: { id, runId: "run-1", shareId: SHARE_ID, publishedWidgetId: "pw-1", widgetTitle: "Widget", kind, at: new Date().toISOString(), detail: `Detail for ${kind}` },
  };
}

describe("SharedSessionEventV1Schema", () => {
  it("validates a dashboard state event", () => {
    const result = SharedSessionEventV1Schema.safeParse(makeDashboardEvent());
    expect(result.success).toBe(true);
  });

  it("validates a trace event", () => {
    const result = SharedSessionEventV1Schema.safeParse(makeTraceEvent());
    expect(result.success).toBe(true);
  });

  it("rejects invalid events", () => {
    const result = SharedSessionEventV1Schema.safeParse({ version: "v1", kind: "unknown" });
    expect(result.success).toBe(false);
  });
});

describe("applySharedSessionEvent", () => {
  it("applies dashboard state", () => {
    const snapshot = buildEmptySharedSessionSnapshot(SHARE_ID);
    const state = makeDashboardState({ title: "Updated" });
    const next = applySharedSessionEvent(snapshot, makeDashboardEvent(state));
    expect(next.dashboard?.title).toBe("Updated");
  });

  it("applies trace events", () => {
    const snapshot = buildEmptySharedSessionSnapshot(SHARE_ID);
    const next = applySharedSessionEvent(snapshot, makeTraceEvent("run-start"));
    expect(next.trace.events).toHaveLength(1);
    expect(next.trace.events[0].kind).toBe("run-start");
  });
});

describe("buildSharedSessionReplayFrames", () => {
  it("returns empty for no trace events", () => {
    expect(buildSharedSessionReplayFrames([])).toEqual([]);
    expect(buildSharedSessionReplayFrames([makeDashboardEvent()])).toEqual([]);
  });

  it("builds frames from trace events", () => {
    const events = [makeDashboardEvent(), makeTraceEvent("run-start", "e1"), makeTraceEvent("tool-call", "e2")];
    const frames = buildSharedSessionReplayFrames(events);
    expect(frames.length).toBe(3); // null frame + 2 trace frames
    expect(frames[0].traceEvent).toBeNull();
    expect(frames[1].traceEvent?.kind).toBe("run-start");
  });
});

describe("findActiveSharedTraceEvent", () => {
  it("returns null for empty events", () => {
    expect(findActiveSharedTraceEvent([])).toBeNull();
  });

  it("returns active event when run is not finished", () => {
    const events: PublishedTraceEventV1[] = [
      { id: "1", runId: "r1", shareId: SHARE_ID, publishedWidgetId: "pw-1", widgetTitle: "W", kind: "run-start", at: "", detail: "" },
      { id: "2", runId: "r1", shareId: SHARE_ID, publishedWidgetId: "pw-1", widgetTitle: "W", kind: "tool-call", at: "", detail: "" },
    ];
    expect(findActiveSharedTraceEvent(events)?.id).toBe("2");
  });

  it("returns null when run is finished", () => {
    const events: PublishedTraceEventV1[] = [
      { id: "1", runId: "r1", shareId: SHARE_ID, publishedWidgetId: "pw-1", widgetTitle: "W", kind: "run-start", at: "", detail: "" },
      { id: "2", runId: "r1", shareId: SHARE_ID, publishedWidgetId: "pw-1", widgetTitle: "W", kind: "run-finished", at: "", detail: "" },
    ];
    expect(findActiveSharedTraceEvent(events)).toBeNull();
  });
});

describe("findLatestSharedTraceEvent", () => {
  it("returns the last event", () => {
    const events: PublishedTraceEventV1[] = [
      { id: "1", runId: "r1", shareId: SHARE_ID, publishedWidgetId: "pw-1", widgetTitle: "W", kind: "run-start", at: "", detail: "" },
      { id: "2", runId: "r1", shareId: SHARE_ID, publishedWidgetId: "pw-1", widgetTitle: "W", kind: "run-finished", at: "", detail: "" },
    ];
    expect(findLatestSharedTraceEvent(events)?.id).toBe("2");
  });
});
