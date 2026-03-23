import { describe, expect, it } from "vitest";
import {
  buildSharedSessionReplayFrames,
  buildSharedSessionReplaySnapshot,
  trimSharedSessionReplayEvents,
  type DashboardSharedStateV1,
  type PublishedTraceEventV1,
  type SharedDashboardStateEventV1,
  type SharedSessionEventV1,
  type SharedSessionPresenceEventV1,
  type SharedSessionStateV1,
  type SharedTraceEventEnvelopeV1,
} from "@/lib/share-types";

const SHARE_ID = "shr_test";
const DASHBOARD_ID = "dash-1";
const PUBLISHED_WIDGET_ID = "share--shr_test--widget-1";

function buildDashboardState(
  widgetTitle: string,
  at: string,
): DashboardSharedStateV1 {
  return {
    version: "v1",
    shareId: SHARE_ID,
    dashboardId: DASHBOARD_ID,
    title: "Markets",
    updatedAt: at,
    viewport: { panX: 0, panY: 0, zoom: 1 },
    textBlocks: [],
    widgets: [{
      sourceWidgetId: "widget-1",
      publishedWidgetId: PUBLISHED_WIDGET_ID,
      revision: "rev-1",
      title: widgetTitle,
      description: "",
      layout: { x: 0, y: 0, w: 4, h: 3 },
      files: {
        "src/App.tsx": "export default function App() { return null; }",
      },
    }],
  };
}

function buildSessionState(
  at: string,
  overrides: Partial<SharedSessionStateV1> = {},
): SharedSessionStateV1 {
  return {
    version: "v1",
    shareId: SHARE_ID,
    updatedAt: at,
    activeWidgetId: null,
    streamingWidgetIds: [],
    currentActions: {},
    ...overrides,
  };
}

function buildDashboardEvent(
  widgetTitle: string,
  at: string,
  stateHash: string,
): SharedDashboardStateEventV1 {
  return {
    version: "v1",
    kind: "dashboard.state",
    shareId: SHARE_ID,
    dashboardId: DASHBOARD_ID,
    at,
    stateHash,
    state: buildDashboardState(widgetTitle, at),
  };
}

function buildSessionEvent(
  at: string,
  overrides: Partial<SharedSessionStateV1> = {},
): SharedSessionPresenceEventV1 {
  return {
    version: "v1",
    kind: "session.presence",
    shareId: SHARE_ID,
    dashboardId: DASHBOARD_ID,
    at,
    state: buildSessionState(at, overrides),
  };
}

function buildTraceEvent(
  id: string,
  kind: PublishedTraceEventV1["kind"],
  at: string,
  detail: string,
): SharedTraceEventEnvelopeV1 {
  return {
    version: "v1",
    kind: "trace.event",
    shareId: SHARE_ID,
    dashboardId: DASHBOARD_ID,
    at,
    event: {
      id,
      runId: "run-1",
      shareId: SHARE_ID,
      publishedWidgetId: PUBLISHED_WIDGET_ID,
      widgetTitle: "Clock",
      kind,
      at,
      detail,
    },
  };
}

describe("shared session replay history", () => {
  it("keeps the latest run with the dashboard baseline that precedes it", () => {
    const olderRunEvents: SharedSessionEventV1[] = [
      buildDashboardEvent("Untitled", "2026-03-23T11:55:00.000Z", "hash-old-baseline"),
      buildTraceEvent(
        "evt-old-start",
        "run-start",
        "2026-03-23T11:55:10.000Z",
        "Started older run",
      ),
      buildDashboardEvent("Weather", "2026-03-23T11:55:20.000Z", "hash-old-result"),
    ];

    const latestRunEvents: SharedSessionEventV1[] = [
      buildDashboardEvent("Untitled", "2026-03-23T12:00:00.000Z", "hash-new-baseline"),
      buildSessionEvent("2026-03-23T12:00:01.000Z", {
        activeWidgetId: PUBLISHED_WIDGET_ID,
        streamingWidgetIds: [PUBLISHED_WIDGET_ID],
        currentActions: {
          [PUBLISHED_WIDGET_ID]: "Generating widget",
        },
      }),
      buildTraceEvent(
        "evt-new-start",
        "run-start",
        "2026-03-23T12:00:02.000Z",
        "Started latest run",
      ),
      buildDashboardEvent("Current Time", "2026-03-23T12:00:05.000Z", "hash-new-result"),
    ];

    const trimmed = trimSharedSessionReplayEvents([
      ...olderRunEvents,
      ...latestRunEvents,
    ]);

    expect(trimmed).toEqual(latestRunEvents);
  });

  it("reconstructs the dashboard from the replay baseline for late viewers", () => {
    const replayEvents: SharedSessionEventV1[] = [
      buildDashboardEvent("Untitled", "2026-03-23T12:00:00.000Z", "hash-baseline"),
      buildSessionEvent("2026-03-23T12:00:01.000Z", {
        activeWidgetId: PUBLISHED_WIDGET_ID,
        streamingWidgetIds: [PUBLISHED_WIDGET_ID],
        currentActions: {
          [PUBLISHED_WIDGET_ID]: "Generating widget",
        },
      }),
      buildTraceEvent(
        "evt-start",
        "run-start",
        "2026-03-23T12:00:02.000Z",
        "Started widget generation",
      ),
      buildDashboardEvent("Current Time", "2026-03-23T12:00:05.000Z", "hash-result"),
    ];

    const replayFrames = buildSharedSessionReplayFrames(replayEvents);
    const baselineSnapshot = buildSharedSessionReplaySnapshot(SHARE_ID, replayEvents, 0);
    const latestSnapshot = buildSharedSessionReplaySnapshot(SHARE_ID, replayEvents, 1);

    expect(replayFrames).toHaveLength(2);
    expect(baselineSnapshot.dashboard?.widgets[0]?.title).toBe("Untitled");
    expect(latestSnapshot.dashboard?.widgets[0]?.title).toBe("Current Time");
  });
});
