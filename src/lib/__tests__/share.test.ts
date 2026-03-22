import { describe, expect, it } from "vitest";
import {
  deriveShareId,
  getPublishedWidgetId,
  getSnapshotStreamId,
  getTraceStreamId,
} from "@/lib/share";

describe("deriveShareId", () => {
  it("is stable for the same dashboard id and secret", () => {
    const first = deriveShareId("dash-123", "test-secret");
    const second = deriveShareId("dash-123", "test-secret");

    expect(first).toBe(second);
    expect(first).toMatch(/^shr_[A-Za-z0-9_-]{22}$/);
  });

  it("changes when dashboard id or secret changes", () => {
    expect(deriveShareId("dash-123", "test-secret")).not.toBe(
      deriveShareId("dash-456", "test-secret"),
    );

    expect(deriveShareId("dash-123", "test-secret")).not.toBe(
      deriveShareId("dash-123", "other-secret"),
    );
  });
});

describe("share naming helpers", () => {
  it("derives stream and published widget ids from shareId", () => {
    expect(getSnapshotStreamId("shr_abc")).toBe("shr_abc.snapshot");
    expect(getTraceStreamId("shr_abc")).toBe("shr_abc.trace");
    expect(getPublishedWidgetId("shr_abc", "widget-1")).toBe(
      "share--shr_abc--widget-1",
    );
  });
});
