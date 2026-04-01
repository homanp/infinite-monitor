import { beforeEach, describe, expect, it } from "vitest";
import {
  getNextWidgetInsertionY,
  resolveActiveDashboardId,
  shiftItemsDown,
  useWidgetStore,
} from "@/store/widget-store";
import type { Dashboard, TextBlock, Widget } from "@/store/widget-store";

function makeWidget(id: string, x: number, y: number, w: number, h: number): Widget {
  return {
    id,
    title: id,
    description: "",
    messages: [],
    layout: { x, y, w, h },
    code: null,
    files: {},
    iframeVersion: 0,
  };
}

function makeTextBlock(id: string, x: number, y: number, w: number, h: number): TextBlock {
  return {
    id,
    text: "",
    fontSize: 24,
    layout: { x, y, w, h },
  };
}

function makeDashboard(id: string, widgetIds: string[] = [], textBlockIds: string[] = []): Dashboard {
  return {
    id,
    title: id,
    widgetIds,
    textBlockIds,
    createdAt: 0,
  };
}

beforeEach(() => {
  useWidgetStore.setState({
    dashboards: [],
    activeDashboardId: null,
    widgets: [],
    textBlocks: [],
    activeWidgetId: null,
    streamingWidgetIds: [],
    currentActions: {},
    reasoningStreamingIds: [],
    viewports: {},
  });
});

describe("shiftItemsDown", () => {
  it("shifts matching widgets down by the given amount", () => {
    const widgets = [makeWidget("w1", 0, 0, 4, 3)];
    const result = shiftItemsDown(widgets, ["w1"], [], [], 3);
    expect(result.widgets[0].layout.y).toBe(3);
    expect(result.widgets[0].layout.x).toBe(0);
  });

  it("does not shift widgets outside the dashboard", () => {
    const widgets = [
      makeWidget("w1", 0, 0, 4, 3),
      makeWidget("w2", 0, 3, 4, 3),
    ];
    const result = shiftItemsDown(widgets, ["w1"], [], [], 3);
    expect(result.widgets[0].layout.y).toBe(3);
    expect(result.widgets[1].layout.y).toBe(3);
  });

  it("shifts both widgets and text blocks", () => {
    const widgets = [makeWidget("w1", 0, 0, 4, 3)];
    const textBlocks = [makeTextBlock("t1", 0, 3, 3, 1)];
    const result = shiftItemsDown(widgets, ["w1"], textBlocks, ["t1"], 1);
    expect(result.widgets[0].layout.y).toBe(1);
    expect(result.textBlocks[0].layout.y).toBe(4);
  });

  it("preserves x position and dimensions when shifting", () => {
    const widgets = [makeWidget("w1", 2, 1, 4, 3)];
    const result = shiftItemsDown(widgets, ["w1"], [], [], 5);
    expect(result.widgets[0].layout).toEqual({ x: 2, y: 6, w: 4, h: 3 });
  });

  it("returns items unchanged when no ids match", () => {
    const widgets = [makeWidget("w1", 0, 0, 4, 3)];
    const textBlocks = [makeTextBlock("t1", 0, 3, 3, 1)];
    const result = shiftItemsDown(widgets, [], textBlocks, [], 5);
    expect(result.widgets[0].layout.y).toBe(0);
    expect(result.textBlocks[0].layout.y).toBe(3);
  });

  it("handles empty arrays", () => {
    const result = shiftItemsDown([], [], [], [], 3);
    expect(result.widgets).toEqual([]);
    expect(result.textBlocks).toEqual([]);
  });
});

describe("getNextWidgetInsertionY", () => {
  it("returns the baseline row when the dashboard is empty", () => {
    expect(getNextWidgetInsertionY([], [], [], [], 3)).toBe(0);
  });

  it("places a new widget above the highest widget or text block", () => {
    const widgets = [
      makeWidget("w1", 0, 4, 4, 3),
      makeWidget("w2", 0, 1, 4, 3),
    ];
    const textBlocks = [makeTextBlock("t1", 0, -2, 3, 1)];

    expect(getNextWidgetInsertionY(widgets, ["w1", "w2"], textBlocks, ["t1"], 3)).toBe(-5);
  });
});

describe("resolveActiveDashboardId", () => {
  it("keeps the current dashboard when it still exists", () => {
    const dashboards = [makeDashboard("dash-1"), makeDashboard("dash-2")];

    expect(resolveActiveDashboardId(dashboards, "dash-2")).toBe("dash-2");
  });

  it("falls back to the first dashboard when the stored id is stale", () => {
    const dashboards = [makeDashboard("dash-1"), makeDashboard("dash-2")];

    expect(resolveActiveDashboardId(dashboards, "missing")).toBe("dash-1");
  });

  it("returns null when there are no dashboards", () => {
    expect(resolveActiveDashboardId([], "missing")).toBeNull();
  });
});

describe("addWidget", () => {
  it("places the first widget at the baseline row", () => {
    const widgetId = useWidgetStore.getState().addWidget("First");
    const { dashboards, activeDashboardId, widgets } = useWidgetStore.getState();

    expect(dashboards).toHaveLength(1);
    expect(activeDashboardId).toBe(dashboards[0].id);
    expect(dashboards[0].widgetIds).toEqual([widgetId]);
    expect(widgets).toHaveLength(1);
    expect(widgets[0].layout).toMatchObject({ x: 0, y: 0, w: 4, h: 3 });
  });

  it("places a new widget directly above the current topmost widget", () => {
    useWidgetStore.setState({
      dashboards: [makeDashboard("dash-1", ["w1", "w2"])],
      activeDashboardId: "dash-1",
      widgets: [
        makeWidget("w1", 0, 6, 4, 3),
        makeWidget("w2", 0, 2, 4, 3),
      ],
    });

    const widgetId = useWidgetStore.getState().addWidget("Inserted");
    const { widgets } = useWidgetStore.getState();
    const inserted = widgets.find((widget) => widget.id === widgetId);

    expect(inserted?.layout.y).toBe(-1);
    expect(widgets.find((widget) => widget.id === "w1")?.layout.y).toBe(6);
    expect(widgets.find((widget) => widget.id === "w2")?.layout.y).toBe(2);
  });

  it("uses text blocks when computing the top edge and leaves existing items unchanged", () => {
    useWidgetStore.setState({
      dashboards: [makeDashboard("dash-1", ["w1", "w2"], ["t1"])],
      activeDashboardId: "dash-1",
      widgets: [
        makeWidget("w1", 0, 7, 4, 3),
        makeWidget("w2", 0, 1, 4, 3),
      ],
      textBlocks: [makeTextBlock("t1", 0, -2, 3, 1)],
    });

    const before = useWidgetStore.getState();
    const widgetId = before.addWidget("Inserted");
    const after = useWidgetStore.getState();
    const inserted = after.widgets.find((widget) => widget.id === widgetId);

    expect(inserted?.layout.y).toBe(-5);
    expect(after.widgets.find((widget) => widget.id === "w1")?.layout.y).toBe(7);
    expect(after.widgets.find((widget) => widget.id === "w2")?.layout.y).toBe(1);
    expect(after.textBlocks.find((block) => block.id === "t1")?.layout.y).toBe(-2);
  });
});

describe("dashboard selection", () => {
  it("falls back to the first dashboard when selecting a stale id", () => {
    useWidgetStore.setState({
      dashboards: [makeDashboard("dash-1"), makeDashboard("dash-2")],
      activeDashboardId: "dash-1",
    });

    useWidgetStore.getState().setActiveDashboard("missing");

    expect(useWidgetStore.getState().activeDashboardId).toBe("dash-1");
  });

  it("moves selection to the next available dashboard when removing the active one", () => {
    useWidgetStore.setState({
      dashboards: [makeDashboard("dash-1"), makeDashboard("dash-2")],
      activeDashboardId: "dash-1",
    });

    useWidgetStore.getState().removeDashboard("dash-1");

    expect(useWidgetStore.getState().activeDashboardId).toBe("dash-2");
  });
});

