export interface CanvasViewportSnapshot {
  panX: number;
  panY: number;
  zoom: number;
}

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewportSnapshot = {
  panX: 24,
  panY: 60,
  zoom: 1,
};

export function isCanvasViewportSnapshot(
  value: unknown,
): value is CanvasViewportSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.panX === "number" &&
    typeof v.panY === "number" &&
    typeof v.zoom === "number"
  );
}

export function normalizeCanvasViewport(
  value: Partial<CanvasViewportSnapshot> | null | undefined,
  fallback = DEFAULT_CANVAS_VIEWPORT,
): CanvasViewportSnapshot {
  if (!value) return fallback;
  return {
    panX: typeof value.panX === "number" ? value.panX : fallback.panX,
    panY: typeof value.panY === "number" ? value.panY : fallback.panY,
    zoom: typeof value.zoom === "number" ? value.zoom : fallback.zoom,
  };
}
