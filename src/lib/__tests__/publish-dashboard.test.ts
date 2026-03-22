import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPublishedDashboardSnapshot,
  lookupPublishedDashboardSnapshot,
} from "@/lib/publish-dashboard";

const ORIGINAL_RIVERRUN_BASE_URL = process.env.RIVERRUN_BASE_URL;

afterEach(() => {
  vi.restoreAllMocks();

  if (ORIGINAL_RIVERRUN_BASE_URL === undefined) {
    delete process.env.RIVERRUN_BASE_URL;
  } else {
    process.env.RIVERRUN_BASE_URL = ORIGINAL_RIVERRUN_BASE_URL;
  }
});

describe("buildPublishedDashboardSnapshot", () => {
  it("builds a sanitized snapshot without widget messages", () => {
    const snapshot = buildPublishedDashboardSnapshot(
      {
        dashboardId: "dash-1",
        title: "Markets",
        textBlocks: [
          {
            id: "text-1",
            text: "Overview",
            fontSize: 32,
            layout: { x: 0, y: 0, w: 3, h: 1 },
          },
        ],
        widgets: [
          {
            id: "widget-1",
            title: "Widget One",
            description: "Shows published output",
            layout: { x: 1, y: 2, w: 4, h: 3 },
            files: {
              "src/App.tsx": "export default function App() { return null; }",
              "src/components/Chart.tsx": "export function Chart() { return null; }",
            },
            messages: [
              {
                id: "msg-1",
                reasoning: "private chain of thought",
                attachments: [{ name: "image.png", url: "data:image/png;base64,..." }],
              },
            ],
          },
        ],
      },
      "shr_test",
      "2026-03-22T12:34:56.000Z",
    );

    expect(snapshot).toEqual({
      version: "v1",
      shareId: "shr_test",
      dashboardId: "dash-1",
      title: "Markets",
      publishedAt: "2026-03-22T12:34:56.000Z",
      textBlocks: [
        {
          id: "text-1",
          text: "Overview",
          fontSize: 32,
          layout: { x: 0, y: 0, w: 3, h: 1 },
        },
      ],
      widgets: [
        {
          sourceWidgetId: "widget-1",
          publishedWidgetId: "share--shr_test--widget-1",
          title: "Widget One",
          description: "Shows published output",
          layout: { x: 1, y: 2, w: 4, h: 3 },
          files: {
            "src/App.tsx": "export default function App() { return null; }",
            "src/components/Chart.tsx": "export function Chart() { return null; }",
          },
        },
      ],
    });

    expect("messages" in snapshot.widgets[0]).toBe(false);
  });
});

describe("lookupPublishedDashboardSnapshot", () => {
  it("reports backend_unavailable when riverrun is not configured", async () => {
    delete process.env.RIVERRUN_BASE_URL;

    await expect(lookupPublishedDashboardSnapshot("shr_test")).resolves.toEqual({
      status: "backend_unavailable",
      message: "RIVERRUN_BASE_URL is not configured",
    });
  });

  it("reports unpublished when the snapshot stream does not exist", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response("", { status: 404 }),
    ));

    await expect(lookupPublishedDashboardSnapshot("shr_test")).resolves.toEqual({
      status: "unpublished",
    });
  });

  it("returns the snapshot when riverrun has a valid published payload", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";

    const snapshot = {
      version: "v1" as const,
      shareId: "shr_test",
      dashboardId: "dash-1",
      title: "Markets",
      publishedAt: "2026-03-22T12:34:56.000Z",
      textBlocks: [],
      widgets: [],
    };

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify(snapshot), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(lookupPublishedDashboardSnapshot("shr_test")).resolves.toEqual({
      status: "ready",
      snapshot,
    });
  });

  it("reports backend_unavailable when riverrun returns an invalid snapshot", async () => {
    process.env.RIVERRUN_BASE_URL = "https://riverrun.test";

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ version: "v1", shareId: "shr_test" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(lookupPublishedDashboardSnapshot("shr_test")).resolves.toEqual({
      status: "backend_unavailable",
      message: "Published snapshot is invalid",
    });
  });
});
