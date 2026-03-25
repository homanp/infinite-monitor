import { describe, expect, it } from "vitest";
import { deriveShareId, getSessionStreamId, getPublishedWidgetId, isPublishedWidgetId } from "@/lib/share";

const TEST_SECRET = "test-secret-for-share-ids";

describe("deriveShareId", () => {
  it("produces a stable ID for the same dashboard", () => {
    const a = deriveShareId("dash-1", TEST_SECRET);
    const b = deriveShareId("dash-1", TEST_SECRET);
    expect(a).toBe(b);
  });

  it("produces different IDs for different dashboards", () => {
    const a = deriveShareId("dash-1", TEST_SECRET);
    const b = deriveShareId("dash-2", TEST_SECRET);
    expect(a).not.toBe(b);
  });

  it("starts with shr_ prefix", () => {
    expect(deriveShareId("dash-1", TEST_SECRET)).toMatch(/^shr_/);
  });
});

describe("getSessionStreamId", () => {
  it("appends .session suffix", () => {
    expect(getSessionStreamId("shr_abc")).toBe("shr_abc.session");
  });
});

describe("getPublishedWidgetId", () => {
  it("creates a composite ID", () => {
    expect(getPublishedWidgetId("shr_abc", "widget-1")).toBe("share--shr_abc--widget-1");
  });
});

describe("isPublishedWidgetId", () => {
  it("returns true for published IDs", () => {
    expect(isPublishedWidgetId("share--shr_abc--widget-1")).toBe(true);
  });

  it("returns false for regular IDs", () => {
    expect(isPublishedWidgetId("widget-1")).toBe(false);
  });
});
