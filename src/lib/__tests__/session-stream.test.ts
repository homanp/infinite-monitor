import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_RIVERRUN_BASE_URL } from "@/lib/riverrun";

vi.mock("@/db/widgets", () => ({
  getDashboardByWidgetId: vi.fn(),
  getWidget: vi.fn(),
}));

vi.mock("@/lib/shared-dashboard-state", () => ({
  buildDashboardSharedState: vi.fn(),
  buildDashboardStateContentHash: vi.fn(),
  loadDashboardPublishSource: vi.fn(),
  materializePublishedWidgets: vi.fn(),
}));

const ORIGINAL_RIVERRUN_BASE_URL = process.env.RIVERRUN_BASE_URL;
const BOOTSTRAP_BOUNDARY = "rr-session-bootstrap";

function buildBootstrapBody(parts: string[]) {
  return `${parts
    .map((part) => `--${BOOTSTRAP_BOUNDARY}\r\n${part}\r\n`)
    .join("")}--${BOOTSTRAP_BOUNDARY}--\r\n`;
}

afterEach(() => {
  vi.restoreAllMocks();

  if (ORIGINAL_RIVERRUN_BASE_URL === undefined) {
    delete process.env.RIVERRUN_BASE_URL;
  } else {
    process.env.RIVERRUN_BASE_URL = ORIGINAL_RIVERRUN_BASE_URL;
  }
});

describe("buildSessionStateContentHash", () => {
  it("ignores updatedAt and normalizes state ordering", async () => {
    const { buildSessionStateContentHash } = await import("@/lib/session-stream");
    const firstHash = buildSessionStateContentHash({
      version: "v1",
      shareId: "shr_test",
      updatedAt: "2026-03-23T12:00:00.000Z",
      activeWidgetId: "share--shr_test--widget-2",
      streamingWidgetIds: ["share--shr_test--widget-2", "share--shr_test--widget-1"],
      currentActions: {
        "share--shr_test--widget-2": "Generating widget",
        "share--shr_test--widget-1": "Loading data",
      },
    });

    const secondHash = buildSessionStateContentHash({
      version: "v1",
      shareId: "shr_test",
      updatedAt: "2026-03-23T12:05:00.000Z",
      activeWidgetId: "share--shr_test--widget-2",
      streamingWidgetIds: ["share--shr_test--widget-1", "share--shr_test--widget-2"],
      currentActions: {
        "share--shr_test--widget-1": "Loading data",
        "share--shr_test--widget-2": "Generating widget",
      },
    });

    expect(firstHash).toBe(secondHash);
  });
});

describe("bootstrapSharedSession", () => {
  it("falls back to the default riverrun base url when env is not configured", async () => {
    const { bootstrapSharedSession } = await import("@/lib/session-stream");
    delete process.env.RIVERRUN_BASE_URL;
    const fetchMock = vi.fn().mockResolvedValue(new Response("", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(bootstrapSharedSession("shr_test")).resolves.toEqual({
      status: "unavailable",
    });

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${DEFAULT_RIVERRUN_BASE_URL}/ds/im-share/shr_test.session/bootstrap`,
    );
  });

  it("builds the latest shared session from snapshot plus retained updates", async () => {
    const { bootstrapSharedSession } = await import("@/lib/session-stream");
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";

    const snapshot = {
      version: "v1" as const,
      shareId: "shr_test",
      dashboard: {
        version: "v1" as const,
        shareId: "shr_test",
        dashboardId: "dash-1",
        title: "Markets",
        updatedAt: "2026-03-23T12:00:00.000Z",
        viewport: { panX: 12, panY: 18, zoom: 1 },
        textBlocks: [],
        widgets: [],
      },
      session: {
        version: "v1" as const,
        shareId: "shr_test",
        updatedAt: "2026-03-23T12:00:00.000Z",
        activeWidgetId: null,
        streamingWidgetIds: [],
        currentActions: {},
      },
      trace: {
        version: "v1" as const,
        shareId: "shr_test",
        updatedAt: "2026-03-23T12:00:00.000Z",
        nextOffset: "12",
        events: [],
      },
      replayEvents: [],
      updatedAt: "2026-03-23T12:00:00.000Z",
    };

    const sessionPresenceEvent = {
      version: "v1" as const,
      kind: "session.presence" as const,
      shareId: "shr_test",
      dashboardId: "dash-1",
      at: "2026-03-23T12:01:00.000Z",
      state: {
        version: "v1" as const,
        shareId: "shr_test",
        updatedAt: "2026-03-23T12:01:00.000Z",
        activeWidgetId: "share--shr_test--widget-1",
        streamingWidgetIds: ["share--shr_test--widget-1"],
        currentActions: {
          "share--shr_test--widget-1": "Generating widget",
        },
      },
    };

    const traceEvent = {
      version: "v1" as const,
      kind: "trace.event" as const,
      shareId: "shr_test",
      dashboardId: "dash-1",
      at: "2026-03-23T12:01:02.000Z",
      event: {
        id: "evt-1",
        runId: "run-1",
        shareId: "shr_test",
        publishedWidgetId: "share--shr_test--widget-1",
        widgetTitle: "Widget One",
        kind: "run-start" as const,
        at: "2026-03-23T12:01:02.000Z",
        detail: "Started widget generation",
      },
    };

    const dashboardEvent = {
      version: "v1" as const,
      kind: "dashboard.state" as const,
      shareId: "shr_test",
      dashboardId: "dash-1",
      at: "2026-03-23T12:01:05.000Z",
      stateHash: "hash-1",
      state: {
        version: "v1" as const,
        shareId: "shr_test",
        dashboardId: "dash-1",
        title: "Markets Live",
        updatedAt: "2026-03-23T12:01:05.000Z",
        viewport: { panX: 24, panY: 32, zoom: 1.1 },
        textBlocks: [],
        widgets: [],
      },
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(
        buildBootstrapBody([
          `Content-Type: application/json\r\n\r\n${JSON.stringify(snapshot)}`,
          `Content-Type: application/json\r\n\r\n${JSON.stringify(sessionPresenceEvent)}`,
          `Content-Type: application/json\r\n\r\n${JSON.stringify(traceEvent)}`,
          `Content-Type: application/json\r\n\r\n${JSON.stringify(dashboardEvent)}`,
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": `multipart/mixed; boundary=${BOOTSTRAP_BOUNDARY}`,
            "Stream-Snapshot-Offset": "12",
            "Stream-Next-Offset": "42",
            "Stream-Up-To-Date": "true",
          },
        },
      ),
    ));

    await expect(bootstrapSharedSession("shr_test")).resolves.toEqual({
      status: "ready",
      snapshot: {
        ...snapshot,
        dashboard: dashboardEvent.state,
        session: sessionPresenceEvent.state,
        trace: {
          ...snapshot.trace,
          updatedAt: "2026-03-23T12:01:02.000Z",
          nextOffset: "42",
          events: [traceEvent.event],
        },
        replayEvents: [
          sessionPresenceEvent,
          traceEvent,
          dashboardEvent,
        ],
        updatedAt: "2026-03-23T12:01:05.000Z",
      },
      nextOffset: "42",
    });
  });
});
