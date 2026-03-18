"use client";

import { useMemo, useCallback, useRef } from "react";
import { Minus, Plus, Maximize, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CELL_W, CELL_H, MARGIN } from "@/components/infinite-canvas";
import type { CanvasLayout } from "@/store/widget-store";

const ZOOM_STEP = 0.05;

interface ZoomControlsProps {
  zoom: number;
  panX: number;
  panY: number;
  containerWidth: number;
  containerHeight: number;
  widgets: Array<{ layout: CanvasLayout }>;
  textBlocks?: Array<{ layout: CanvasLayout }>;
  onViewportChange: (panX: number, panY: number, zoom: number) => void;
}

function getWorldBounds(widgets: Array<{ layout: CanvasLayout }>) {
  const step = CELL_W + MARGIN;
  const stepY = CELL_H + MARGIN;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const w of widgets) {
    const left = w.layout.x * step;
    const top = w.layout.y * stepY;
    const right = left + w.layout.w * step - MARGIN;
    const bottom = top + w.layout.h * stepY - MARGIN;
    if (left < minX) minX = left;
    if (top < minY) minY = top;
    if (right > maxX) maxX = right;
    if (bottom > maxY) maxY = bottom;
  }

  return { minX, minY, maxX, maxY };
}

export function ZoomControls({
  zoom,
  panX,
  panY,
  containerWidth,
  containerHeight,
  widgets,
  textBlocks = [],
  onViewportChange,
}: ZoomControlsProps) {
  const allCanvasItems = useMemo(
    () => [...widgets, ...textBlocks],
    [widgets, textBlocks]
  );
  const zoomIn = () => {
    const newZoom = Math.min(3, zoom + ZOOM_STEP);
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;
    const worldX = (cx - panX) / zoom;
    const worldY = (cy - panY) / zoom;
    onViewportChange(cx - worldX * newZoom, cy - worldY * newZoom, newZoom);
  };

  const zoomOut = () => {
    const newZoom = Math.max(0.1, zoom - ZOOM_STEP);
    const cx = containerWidth / 2;
    const cy = containerHeight / 2;
    const worldX = (cx - panX) / zoom;
    const worldY = (cy - panY) / zoom;
    onViewportChange(cx - worldX * newZoom, cy - worldY * newZoom, newZoom);
  };

  const resetView = () => {
    onViewportChange(0, 0, 1);
  };

  const fitToView = () => {
    if (allCanvasItems.length === 0) {
      resetView();
      return;
    }

    const { minX, minY, maxX, maxY } = getWorldBounds(allCanvasItems);
    const contentW = maxX - minX;
    const contentH = maxY - minY;
    const padding = 60;
    const availW = containerWidth - padding * 2;
    const availH = containerHeight - padding * 2;

    const fitZoom = Math.min(1, Math.min(availW / contentW, availH / contentH));
    const fitPanX = (containerWidth - contentW * fitZoom) / 2 - minX * fitZoom;
    const fitPanY = (containerHeight - contentH * fitZoom) / 2 - minY * fitZoom;

    onViewportChange(fitPanX, fitPanY, fitZoom);
  };

  return (
    <div className="absolute bottom-4 right-4 z-50 flex flex-col items-stretch gap-2 w-[200px]">
      <Minimap
        panX={panX}
        panY={panY}
        zoom={zoom}
        containerWidth={containerWidth}
        containerHeight={containerHeight}
        widgets={allCanvasItems}
        onViewportChange={onViewportChange}
      />
      <div className="flex items-center justify-between gap-1 bg-zinc-800 border border-zinc-700 px-1 py-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
          onClick={zoomOut}
        >
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="text-[11px] text-zinc-400 w-10 text-center tabular-nums select-none">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
          onClick={zoomIn}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <div className="w-px h-4 bg-zinc-700 mx-0.5" />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
          onClick={fitToView}
          title="Fit to view"
        >
          <Maximize className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
          onClick={resetView}
          title="Reset view"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

const MINIMAP_W = 200;
const MINIMAP_H = 120;
const MINIMAP_PAD = 8;

function Minimap({
  panX,
  panY,
  zoom,
  containerWidth,
  containerHeight,
  widgets,
  onViewportChange,
}: {
  panX: number;
  panY: number;
  zoom: number;
  containerWidth: number;
  containerHeight: number;
  widgets: Array<{ layout: CanvasLayout }>;
  onViewportChange: (panX: number, panY: number, zoom: number) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const { rects, viewRect } = useMemo(() => {
    if (widgets.length === 0)
      return { rects: [], viewRect: { x: 0, y: 0, w: MINIMAP_W, h: MINIMAP_H }, scale: 1 };

    const { minX, minY, maxX, maxY } = getWorldBounds(widgets);

    const viewLeft = -panX / zoom;
    const viewTop = -panY / zoom;
    const viewRight = viewLeft + containerWidth / zoom;
    const viewBottom = viewTop + containerHeight / zoom;

    const worldLeft = Math.min(minX, viewLeft);
    const worldTop = Math.min(minY, viewTop);
    const worldRight = Math.max(maxX, viewRight);
    const worldBottom = Math.max(maxY, viewBottom);

    const worldW = worldRight - worldLeft || 1;
    const worldH = worldBottom - worldTop || 1;

    const inner = MINIMAP_W - MINIMAP_PAD * 2;
    const innerH = MINIMAP_H - MINIMAP_PAD * 2;
    const s = Math.min(inner / worldW, innerH / worldH);

    const step = CELL_W + MARGIN;
    const stepY = CELL_H + MARGIN;

    const rs = widgets.map((w) => ({
      x: MINIMAP_PAD + (w.layout.x * step - worldLeft) * s,
      y: MINIMAP_PAD + (w.layout.y * stepY - worldTop) * s,
      w: (w.layout.w * step - MARGIN) * s,
      h: (w.layout.h * stepY - MARGIN) * s,
    }));

    const vr = {
      x: MINIMAP_PAD + (viewLeft - worldLeft) * s,
      y: MINIMAP_PAD + (viewTop - worldTop) * s,
      w: (containerWidth / zoom) * s,
      h: (containerHeight / zoom) * s,
    };

    return { rects: rs, viewRect: vr, scale: s, worldLeft, worldTop };
  }, [widgets, panX, panY, zoom, containerWidth, containerHeight]);

  const jumpTo = useCallback(
    (clientX: number, clientY: number) => {
      const el = mapRef.current;
      if (!el || widgets.length === 0) return;

      const rect = el.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;

      const { minX, minY, maxX, maxY } = getWorldBounds(widgets);
      const viewLeft = -panX / zoom;
      const viewTop = -panY / zoom;
      const viewRight = viewLeft + containerWidth / zoom;
      const viewBottom = viewTop + containerHeight / zoom;

      const worldLeft = Math.min(minX, viewLeft);
      const worldTop = Math.min(minY, viewTop);
      const worldRight = Math.max(maxX, viewRight);
      const worldBottom = Math.max(maxY, viewBottom);

      const worldW = worldRight - worldLeft || 1;
      const worldH = worldBottom - worldTop || 1;

      const inner = MINIMAP_W - MINIMAP_PAD * 2;
      const innerH = MINIMAP_H - MINIMAP_PAD * 2;
      const s = Math.min(inner / worldW, innerH / worldH);

      const worldX = (mx - MINIMAP_PAD) / s + worldLeft;
      const worldY = (my - MINIMAP_PAD) / s + worldTop;

      const newPanX = -(worldX - containerWidth / zoom / 2) * zoom;
      const newPanY = -(worldY - containerHeight / zoom / 2) * zoom;

      onViewportChange(newPanX, newPanY, zoom);
    },
    [panX, panY, zoom, containerWidth, containerHeight, widgets, onViewportChange]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      dragging.current = true;
      mapRef.current!.setPointerCapture(e.pointerId);
      jumpTo(e.clientX, e.clientY);
    },
    [jumpTo]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return;
      jumpTo(e.clientX, e.clientY);
    },
    [jumpTo]
  );

  const handlePointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (widgets.length === 0) return null;

  return (
    <div
      ref={mapRef}
      className="relative w-full bg-zinc-900/90 border border-zinc-700 cursor-crosshair select-none overflow-hidden"
      style={{ height: MINIMAP_H }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <svg width={MINIMAP_W} height={MINIMAP_H} className="absolute inset-0">
        {rects.map((r, i) => (
          <rect
            key={i}
            x={r.x}
            y={r.y}
            width={Math.max(2, r.w)}
            height={Math.max(2, r.h)}
            fill="rgba(161,161,170,0.35)"
            rx={1}
          />
        ))}
        <rect
          x={viewRect.x}
          y={viewRect.y}
          width={viewRect.w}
          height={viewRect.h}
          fill="none"
          stroke="rgba(94,234,212,0.6)"
          strokeWidth={1.5}
          rx={1}
        />
      </svg>
    </div>
  );
}
