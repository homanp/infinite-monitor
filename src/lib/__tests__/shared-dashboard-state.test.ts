import { describe, expect, it } from "vitest";
import {
  buildDashboardSharedState,
  buildDashboardStateContentHash,
} from "@/lib/shared-dashboard-state";

describe("buildDashboardSharedState", () => {
  it("builds a sanitized shared state without widget messages", () => {
    const state = buildDashboardSharedState(
      {
        dashboardId: "dash-1",
        title: "Markets",
        viewport: { panX: 24, panY: 60, zoom: 1 },
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
            description: "Shows shared output",
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

    expect(state).toEqual({
      version: "v1",
      shareId: "shr_test",
      dashboardId: "dash-1",
      title: "Markets",
      updatedAt: "2026-03-22T12:34:56.000Z",
      viewport: { panX: 24, panY: 60, zoom: 1 },
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
          revision: expect.any(String),
          title: "Widget One",
          description: "Shows shared output",
          layout: { x: 1, y: 2, w: 4, h: 3 },
          files: {
            "src/App.tsx": "export default function App() { return null; }",
            "src/components/Chart.tsx": "export function Chart() { return null; }",
          },
        },
      ],
    });

    expect("messages" in state.widgets[0]).toBe(false);
  });

  it("ignores updatedAt when hashing equivalent shared state content", () => {
    const source = {
      dashboardId: "dash-1",
      title: "Markets",
      viewport: { panX: 24, panY: 60, zoom: 1 },
      textBlocks: [],
      widgets: [
        {
          id: "widget-1",
          title: "Widget One",
          description: "Shows shared output",
          layout: { x: 1, y: 2, w: 4, h: 3 },
          files: {
            "src/components/Chart.tsx": "export function Chart() { return null; }",
            "src/App.tsx": "export default function App() { return null; }",
          },
        },
      ],
    };

    const firstState = buildDashboardSharedState(
      source,
      "shr_test",
      "2026-03-22T12:34:56.000Z",
    );
    const secondState = buildDashboardSharedState(
      source,
      "shr_test",
      "2026-03-22T12:35:56.000Z",
    );

    expect(buildDashboardStateContentHash(firstState)).toBe(
      buildDashboardStateContentHash(secondState),
    );
  });
});
