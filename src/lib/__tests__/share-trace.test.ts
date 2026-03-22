import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bootstrapPublishedDashboardTrace,
  buildEmptyPublishedDashboardTrace,
  lookupPublishedDashboardTrace,
  mergePublishedTraceEvents,
} from "@/lib/share-trace";

const ORIGINAL_RIVERRUN_BASE_URL = process.env.RIVERRUN_BASE_URL;
const BOOTSTRAP_BOUNDARY = "rr-bootstrap-test";

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

describe("buildEmptyPublishedDashboardTrace", () => {
  it("creates an empty trace snapshot for a share", () => {
    expect(buildEmptyPublishedDashboardTrace("shr_test", "2026-03-22T00:00:00.000Z")).toEqual({
      version: "v1",
      shareId: "shr_test",
      updatedAt: "2026-03-22T00:00:00.000Z",
      nextOffset: null,
      events: [],
    });
  });
});

describe("mergePublishedTraceEvents", () => {
  it("appends events and updates updatedAt", () => {
    const currentTrace = buildEmptyPublishedDashboardTrace(
      "shr_test",
      "2026-03-22T00:00:00.000Z",
    );

    const nextTrace = mergePublishedTraceEvents(currentTrace, [
      {
        id: "evt-1",
        runId: "run-1",
        shareId: "shr_test",
        publishedWidgetId: "share--shr_test--widget-1",
        widgetTitle: "Widget One",
        kind: "run-start",
        at: "2026-03-22T01:00:00.000Z",
        detail: "Started widget generation",
      },
      {
        id: "evt-2",
        runId: "run-1",
        shareId: "shr_test",
        publishedWidgetId: "share--shr_test--widget-1",
        widgetTitle: "Widget One",
        kind: "run-finished",
        at: "2026-03-22T01:01:00.000Z",
        detail: "Completed widget generation",
      },
    ]);

    expect(nextTrace.updatedAt).toBe("2026-03-22T01:01:00.000Z");
    expect(nextTrace.nextOffset).toBeNull();
    expect(nextTrace.events.map((event) => event.id)).toEqual(["evt-1", "evt-2"]);
  });
});

describe("lookupPublishedDashboardTrace", () => {
  it("reports backend_unavailable when riverrun is not configured", async () => {
    delete process.env.RIVERRUN_BASE_URL;

    await expect(lookupPublishedDashboardTrace("shr_test")).resolves.toEqual({
      status: "backend_unavailable",
      message: "RIVERRUN_BASE_URL is not configured",
    });
  });

  it("returns an empty trace when the stream has no published snapshot yet", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("", { status: 404 }),
    ));

    await expect(lookupPublishedDashboardTrace("shr_test")).resolves.toEqual({
      status: "ready",
      trace: {
        version: "v1",
        shareId: "shr_test",
        updatedAt: expect.any(String),
        nextOffset: null,
        events: [],
      },
    });
  });

  it("returns a valid published trace snapshot", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";

    const trace = {
      version: "v1" as const,
      shareId: "shr_test",
      updatedAt: "2026-03-22T12:34:56.000Z",
      nextOffset: "42",
      events: [
        {
          id: "evt-1",
          runId: "run-1",
          shareId: "shr_test",
          publishedWidgetId: "share--shr_test--widget-1",
          widgetTitle: "Widget One",
          kind: "run-start" as const,
          at: "2026-03-22T12:34:50.000Z",
          detail: "Started widget generation",
        },
      ],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(trace), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(lookupPublishedDashboardTrace("shr_test")).resolves.toEqual({
      status: "ready",
      trace,
    });
  });

  it("reports backend_unavailable when the trace payload is invalid", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: "v1", shareId: "shr_test", events: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(lookupPublishedDashboardTrace("shr_test")).resolves.toEqual({
      status: "backend_unavailable",
      message: "Published trace snapshot is invalid",
    });
  });
});

describe("bootstrapPublishedDashboardTrace", () => {
  it("returns snapshot plus retained updates for live tail startup", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";

    const trace = {
      version: "v1" as const,
      shareId: "shr_test",
      updatedAt: "2026-03-22T12:34:56.000Z",
      nextOffset: "12",
      events: [],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(
        buildBootstrapBody([
          `Content-Type: application/json\r\n\r\n${JSON.stringify(trace)}`,
          `Content-Type: application/json\r\n\r\n${JSON.stringify({
            id: "evt-2",
            runId: "run-1",
            shareId: "shr_test",
            publishedWidgetId: "share--shr_test--widget-1",
            widgetTitle: "Widget One",
            kind: "run-finished",
            at: "2026-03-22T12:35:10.000Z",
            detail: "Completed widget generation",
          })}`,
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

    await expect(bootstrapPublishedDashboardTrace("shr_test")).resolves.toEqual({
      status: "ready",
      trace: {
        ...trace,
        updatedAt: "2026-03-22T12:35:10.000Z",
        nextOffset: "42",
        events: [
          {
            id: "evt-2",
            runId: "run-1",
            shareId: "shr_test",
            publishedWidgetId: "share--shr_test--widget-1",
            widgetTitle: "Widget One",
            kind: "run-finished",
            at: "2026-03-22T12:35:10.000Z",
            detail: "Completed widget generation",
          },
        ],
      },
      nextOffset: "42",
    });
  });

  it("returns an empty trace when bootstrap has no snapshot yet", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(
        buildBootstrapBody([
          "Content-Type: application/octet-stream\r\n\r\n",
        ]),
        {
          status: 200,
          headers: {
            "Content-Type": `multipart/mixed; boundary=${BOOTSTRAP_BOUNDARY}`,
            "Stream-Snapshot-Offset": "-1",
            "Stream-Next-Offset": "7",
            "Stream-Up-To-Date": "true",
          },
        },
      ),
    ));

    await expect(bootstrapPublishedDashboardTrace("shr_test")).resolves.toEqual({
      status: "ready",
      trace: {
        version: "v1",
        shareId: "shr_test",
        updatedAt: expect.any(String),
        nextOffset: "7",
        events: [],
      },
      nextOffset: "7",
    });
  });
});
