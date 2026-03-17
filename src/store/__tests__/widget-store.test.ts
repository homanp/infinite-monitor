import { describe, it, expect } from "vitest";
import { shiftItemsDown } from "@/store/widget-store";
import type { Widget, TextBlock } from "@/store/widget-store";

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
