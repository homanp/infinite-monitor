import { describe, expect, it } from "vitest";
import { hasDurableStoreStateChanged } from "@/lib/sync-db";

function buildDurableState() {
  return {
    dashboards: [{
      id: "dash-1",
      title: "Dashboard",
      widgetIds: ["widget-1"],
      textBlockIds: ["text-1"],
      createdAt: 0,
    }],
    widgets: [{
      id: "widget-1",
      title: "Widget",
      description: "",
      messages: [],
      layout: { x: 0, y: 0, w: 4, h: 3 },
      code: null,
      files: {},
      iframeVersion: 0,
    }],
    textBlocks: [{
      id: "text-1",
      text: "Hello",
      fontSize: 16,
      layout: { x: 0, y: 0, w: 3, h: 1 },
    }],
    viewports: { "dash-1": { panX: 0, panY: 0, zoom: 1 } },
  };
}

describe("hasDurableStoreStateChanged", () => {
  it("ignores non-durable state changes when durable references are unchanged", () => {
    const durableState = buildDurableState();

    expect(hasDurableStoreStateChanged(durableState, durableState)).toBe(false);
  });

  it("detects dashboard, widget, text block, and viewport reference changes", () => {
    const previousState = buildDurableState();

    expect(hasDurableStoreStateChanged(
      { ...previousState, dashboards: [...previousState.dashboards] },
      previousState,
    )).toBe(true);

    expect(hasDurableStoreStateChanged(
      { ...previousState, widgets: [...previousState.widgets] },
      previousState,
    )).toBe(true);

    expect(hasDurableStoreStateChanged(
      { ...previousState, textBlocks: [...previousState.textBlocks] },
      previousState,
    )).toBe(true);

    expect(hasDurableStoreStateChanged(
      { ...previousState, viewports: { ...previousState.viewports } },
      previousState,
    )).toBe(true);
  });
});
