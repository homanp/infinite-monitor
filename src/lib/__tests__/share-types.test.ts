import { describe, expect, it } from "vitest";
import {
  buildSharedSessionReplayFrames,
  buildSharedSessionReplaySnapshot,
  mergeFocusedWidgetReplayDashboard,
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
const SECOND_PUBLISHED_WIDGET_ID = "share--shr_test--widget-2";

function buildDashboardState(
  widgetTitle: string,
  at: string,
): DashboardSharedStateV1 {
  return buildDashboardStateWithTitles([widgetTitle], at);
}

function buildDashboardStateWithTitles(
  widgetTitles: string[],
  at: string,
): DashboardSharedStateV1 {
  return buildDashboardStateWithWidgets(
    widgetTitles.map((title) => ({ title })),
    at,
  );
}

function buildDashboardStateWithWidgets(
  widgets: Array<{
    title: string;
    description?: string;
    layout?: DashboardSharedStateV1["widgets"][number]["layout"];
    revision?: string;
    files?: Record<string, string>;
  }>,
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
    widgets: widgets.map((widget, index) => ({
      sourceWidgetId: `widget-${index + 1}`,
      publishedWidgetId: index === 0
        ? PUBLISHED_WIDGET_ID
        : SECOND_PUBLISHED_WIDGET_ID,
      revision: widget.revision ?? `rev-${index + 1}`,
      title: widget.title,
      description: widget.description ?? "",
      layout: widget.layout ?? { x: index * 4, y: 0, w: 4, h: 3 },
      files: widget.files ?? {
        "src/App.tsx": "export default function App() { return null; }",
      },
    })),
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
  overrides: Partial<Pick<PublishedTraceEventV1, "publishedWidgetId" | "widgetTitle">> = {},
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
      publishedWidgetId: overrides.publishedWidgetId ?? PUBLISHED_WIDGET_ID,
      widgetTitle: overrides.widgetTitle ?? "Clock",
      kind,
      at,
      detail,
    },
  };
}

describe("shared session replay history", () => {
  it("keeps multiple widget runs inside the replay window", () => {
    const replayEvents: SharedSessionEventV1[] = [
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T11:55:00.000Z",
        stateHash: "hash-baseline",
        state: buildDashboardStateWithTitles(
          ["Untitled Clock", "Untitled Weather"],
          "2026-03-23T11:55:00.000Z",
        ),
      },
      buildTraceEvent(
        "evt-clock-start",
        "run-start",
        "2026-03-23T11:55:10.000Z",
        "Started clock run",
        {
          publishedWidgetId: PUBLISHED_WIDGET_ID,
          widgetTitle: "Clock",
        },
      ),
      buildTraceEvent(
        "evt-clock-finished",
        "run-finished",
        "2026-03-23T11:55:20.000Z",
        "Finished clock run",
        {
          publishedWidgetId: PUBLISHED_WIDGET_ID,
          widgetTitle: "Clock",
        },
      ),
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T11:55:30.000Z",
        stateHash: "hash-after-clock",
        state: buildDashboardStateWithTitles(
          ["Current Time", "Untitled Weather"],
          "2026-03-23T11:55:30.000Z",
        ),
      },
      buildTraceEvent(
        "evt-weather-start",
        "run-start",
        "2026-03-23T12:00:02.000Z",
        "Started weather run",
        {
          publishedWidgetId: SECOND_PUBLISHED_WIDGET_ID,
          widgetTitle: "Weather",
        },
      ),
      buildTraceEvent(
        "evt-weather-finished",
        "run-finished",
        "2026-03-23T12:00:04.000Z",
        "Finished weather run",
        {
          publishedWidgetId: SECOND_PUBLISHED_WIDGET_ID,
          widgetTitle: "Weather",
        },
      ),
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T12:00:05.000Z",
        stateHash: "hash-after-weather",
        state: buildDashboardStateWithTitles(
          ["Current Time", "San Francisco Weather"],
          "2026-03-23T12:00:05.000Z",
        ),
      },
    ];

    const trimmed = trimSharedSessionReplayEvents(replayEvents);

    expect(trimmed).toEqual(replayEvents);
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

  it("replays sequential widget runs without dropping earlier widgets", () => {
    const replayEvents: SharedSessionEventV1[] = [
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T11:55:00.000Z",
        stateHash: "hash-multi-baseline",
        state: buildDashboardStateWithTitles(
          ["Untitled Clock", "Untitled Weather"],
          "2026-03-23T11:55:00.000Z",
        ),
      },
      buildTraceEvent(
        "evt-clock-start",
        "run-start",
        "2026-03-23T11:55:10.000Z",
        "Started clock run",
        {
          publishedWidgetId: PUBLISHED_WIDGET_ID,
          widgetTitle: "Clock",
        },
      ),
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T11:55:30.000Z",
        stateHash: "hash-multi-after-clock",
        state: buildDashboardStateWithTitles(
          ["Current Time", "Untitled Weather"],
          "2026-03-23T11:55:30.000Z",
        ),
      },
      buildTraceEvent(
        "evt-weather-start",
        "run-start",
        "2026-03-23T12:00:02.000Z",
        "Started weather run",
        {
          publishedWidgetId: SECOND_PUBLISHED_WIDGET_ID,
          widgetTitle: "Weather",
        },
      ),
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T12:00:05.000Z",
        stateHash: "hash-multi-after-weather",
        state: buildDashboardStateWithTitles(
          ["Current Time", "San Francisco Weather"],
          "2026-03-23T12:00:05.000Z",
        ),
      },
    ];

    const replayFrames = buildSharedSessionReplayFrames(replayEvents);
    const baselineSnapshot = buildSharedSessionReplaySnapshot(SHARE_ID, replayEvents, 0);
    const afterClockSnapshot = buildSharedSessionReplaySnapshot(SHARE_ID, replayEvents, 1);
    const afterWeatherSnapshot = buildSharedSessionReplaySnapshot(SHARE_ID, replayEvents, 2);

    expect(replayFrames).toHaveLength(3);
    expect(baselineSnapshot.dashboard?.widgets.map((widget) => widget.title)).toEqual([
      "Untitled Clock",
      "Untitled Weather",
    ]);
    expect(afterClockSnapshot.dashboard?.widgets.map((widget) => widget.title)).toEqual([
      "Current Time",
      "Untitled Weather",
    ]);
    expect(afterWeatherSnapshot.dashboard?.widgets.map((widget) => widget.title)).toEqual([
      "Current Time",
      "San Francisco Weather",
    ]);
  });

  it("builds widget-specific replay snapshots when a widget is selected", () => {
    const replayEvents: SharedSessionEventV1[] = [
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T11:55:00.000Z",
        stateHash: "hash-widget-filter-baseline",
        state: buildDashboardStateWithTitles(
          ["Untitled Clock", "Untitled Weather"],
          "2026-03-23T11:55:00.000Z",
        ),
      },
      buildTraceEvent(
        "evt-clock-start",
        "run-start",
        "2026-03-23T11:55:10.000Z",
        "Started clock run",
        {
          publishedWidgetId: PUBLISHED_WIDGET_ID,
          widgetTitle: "Clock",
        },
      ),
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T11:55:30.000Z",
        stateHash: "hash-widget-filter-after-clock",
        state: buildDashboardStateWithTitles(
          ["Current Time", "Untitled Weather"],
          "2026-03-23T11:55:30.000Z",
        ),
      },
      buildTraceEvent(
        "evt-weather-start",
        "run-start",
        "2026-03-23T12:00:02.000Z",
        "Started weather run",
        {
          publishedWidgetId: SECOND_PUBLISHED_WIDGET_ID,
          widgetTitle: "Weather",
        },
      ),
      {
        version: "v1",
        kind: "dashboard.state",
        shareId: SHARE_ID,
        dashboardId: DASHBOARD_ID,
        at: "2026-03-23T12:00:05.000Z",
        stateHash: "hash-widget-filter-after-weather",
        state: buildDashboardStateWithTitles(
          ["Current Time", "San Francisco Weather"],
          "2026-03-23T12:00:05.000Z",
        ),
      },
    ];

    const clockFrames = buildSharedSessionReplayFrames(replayEvents, PUBLISHED_WIDGET_ID);
    const weatherFrames = buildSharedSessionReplayFrames(replayEvents, SECOND_PUBLISHED_WIDGET_ID);
    const clockSnapshot = buildSharedSessionReplaySnapshot(
      SHARE_ID,
      replayEvents,
      1,
      PUBLISHED_WIDGET_ID,
    );
    const weatherSnapshot = buildSharedSessionReplaySnapshot(
      SHARE_ID,
      replayEvents,
      1,
      SECOND_PUBLISHED_WIDGET_ID,
    );

    expect(clockFrames).toHaveLength(2);
    expect(weatherFrames).toHaveLength(2);

    expect(clockSnapshot.dashboard?.widgets.map((widget) => widget.title)).toEqual([
      "Current Time",
      "Untitled Weather",
    ]);
    expect(weatherSnapshot.dashboard?.widgets.map((widget) => widget.title)).toEqual([
      "Current Time",
      "San Francisco Weather",
    ]);
  });

  it("keeps non-focused widgets on the latest title when replaying a focused widget", () => {
    const liveDashboard = buildDashboardStateWithTitles(
      ["Current Time", "San Francisco Weather"],
      "2026-03-23T12:00:05.000Z",
    );
    const replayDashboard = buildDashboardStateWithTitles(
      ["Untitled Clock", "Untitled Weather"],
      "2026-03-23T11:55:00.000Z",
    );

    const mergedDashboard = mergeFocusedWidgetReplayDashboard(
      liveDashboard,
      replayDashboard,
      PUBLISHED_WIDGET_ID,
    );

    expect(mergedDashboard?.widgets.map((widget) => widget.title)).toEqual([
      "Untitled Clock",
      "San Francisco Weather",
    ]);
  });

  it("keeps the latest layout when replaying a focused widget", () => {
    const liveDashboard = buildDashboardStateWithWidgets([
      {
        title: "Current Time",
        layout: { x: 8, y: 4, w: 6, h: 5 },
        revision: "live-rev-1",
        files: { "src/App.tsx": "export default function App() { return 'live'; }" },
      },
      {
        title: "San Francisco Weather",
        layout: { x: 1, y: 2, w: 4, h: 3 },
      },
    ], "2026-03-23T12:00:05.000Z");
    const replayDashboard = buildDashboardStateWithWidgets([
      {
        title: "Untitled Clock",
        layout: { x: 0, y: 0, w: 4, h: 3 },
        revision: "replay-rev-1",
        files: { "src/App.tsx": "export default function App() { return 'replay'; }" },
      },
      {
        title: "Untitled Weather",
        layout: { x: 20, y: 10, w: 8, h: 6 },
      },
    ], "2026-03-23T11:55:00.000Z");

    const mergedDashboard = mergeFocusedWidgetReplayDashboard(
      liveDashboard,
      replayDashboard,
      PUBLISHED_WIDGET_ID,
    );

    expect(mergedDashboard?.widgets[0]).toMatchObject({
      title: "Untitled Clock",
      layout: { x: 8, y: 4, w: 6, h: 5 },
      revision: "replay-rev-1",
      files: { "src/App.tsx": "export default function App() { return 'replay'; }" },
    });
    expect(mergedDashboard?.widgets[1]).toMatchObject({
      title: "San Francisco Weather",
      layout: { x: 1, y: 2, w: 4, h: 3 },
    });
  });
});
