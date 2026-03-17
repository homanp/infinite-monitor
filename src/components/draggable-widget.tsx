"use client";

import { useRef, useState, useCallback, type ReactNode } from "react";
import { CELL_W, CELL_H, MARGIN } from "@/components/infinite-canvas";

const MIN_W = 2;
const MIN_H = 2;

function gridToPixelX(col: number) {
  return col * (CELL_W + MARGIN);
}
function gridToPixelY(row: number) {
  return row * (CELL_H + MARGIN);
}
function gridWidth(cols: number) {
  return cols * (CELL_W + MARGIN) - MARGIN;
}
function gridHeight(rows: number) {
  return rows * (CELL_H + MARGIN) - MARGIN;
}

interface DraggableWidgetProps {
  x: number;
  y: number;
  w: number;
  h: number;
  zoom: number;
  onLayoutChange: (layout: { x: number; y: number; w: number; h: number }) => void;
  children: ReactNode;
}

export function DraggableWidget({
  x,
  y,
  w,
  h,
  zoom,
  onLayoutChange,
  children,
}: DraggableWidgetProps) {
  const [dragOffset, setDragOffset] = useState<{ dx: number; dy: number } | null>(null);
  const [resizeOffset, setResizeOffset] = useState<{ dw: number; dh: number } | null>(null);
  const dragStart = useRef({ clientX: 0, clientY: 0 });
  const dragOffsetRef = useRef<{ dx: number; dy: number } | null>(null);
  const resizeOffsetRef = useRef<{ dw: number; dh: number } | null>(null);

  const handleDragStart = useCallback(
    (e: React.PointerEvent) => {
      const el = e.target as HTMLElement;
      if (!el.closest(".drag-handle") || el.closest("button")) return;
      e.stopPropagation();
      e.preventDefault();
      dragStart.current = { clientX: e.clientX, clientY: e.clientY };
      const initial = { dx: 0, dy: 0 };
      dragOffsetRef.current = initial;
      setDragOffset(initial);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const onMove = (me: PointerEvent) => {
        const dx = (me.clientX - dragStart.current.clientX) / zoom;
        const dy = (me.clientY - dragStart.current.clientY) / zoom;
        const offset = { dx, dy };
        dragOffsetRef.current = offset;
        setDragOffset(offset);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const prev = dragOffsetRef.current;
        dragOffsetRef.current = null;
        setDragOffset(null);
        if (prev) {
          const newX = Math.round((gridToPixelX(x) + prev.dx) / (CELL_W + MARGIN));
          const newY = Math.round((gridToPixelY(y) + prev.dy) / (CELL_H + MARGIN));
          onLayoutChange({ x: newX, y: newY, w, h });
        }
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [x, y, w, h, zoom, onLayoutChange]
  );

  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      dragStart.current = { clientX: e.clientX, clientY: e.clientY };
      const initial = { dw: 0, dh: 0 };
      resizeOffsetRef.current = initial;
      setResizeOffset(initial);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const onMove = (me: PointerEvent) => {
        const dw = (me.clientX - dragStart.current.clientX) / zoom;
        const dh = (me.clientY - dragStart.current.clientY) / zoom;
        const offset = { dw, dh };
        resizeOffsetRef.current = offset;
        setResizeOffset(offset);
      };
      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        const prev = resizeOffsetRef.current;
        resizeOffsetRef.current = null;
        setResizeOffset(null);
        if (prev) {
          const newW = Math.max(
            MIN_W,
            Math.round((gridWidth(w) + prev.dw + MARGIN) / (CELL_W + MARGIN))
          );
          const newH = Math.max(
            MIN_H,
            Math.round((gridHeight(h) + prev.dh + MARGIN) / (CELL_H + MARGIN))
          );
          onLayoutChange({ x, y, w: newW, h: newH });
        }
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [x, y, w, h, zoom, onLayoutChange]
  );

  const pixelX = gridToPixelX(x) + (dragOffset?.dx ?? 0);
  const pixelY = gridToPixelY(y) + (dragOffset?.dy ?? 0);
  const pixelW = gridWidth(w) + (resizeOffset?.dw ?? 0);
  const pixelH = gridHeight(h) + (resizeOffset?.dh ?? 0);

  const snappedX = dragOffset
    ? Math.round(pixelX / (CELL_W + MARGIN))
    : null;
  const snappedY = dragOffset
    ? Math.round(pixelY / (CELL_H + MARGIN))
    : null;

  return (
    <>
      {dragOffset && snappedX !== null && snappedY !== null && (
        <div
          className="absolute border border-dashed border-teal-500/50 bg-teal-500/5 pointer-events-none"
          style={{
            left: gridToPixelX(snappedX),
            top: gridToPixelY(snappedY),
            width: gridWidth(w),
            height: gridHeight(h),
          }}
        />
      )}
      <div
        data-widget
        className="absolute"
        style={{
          left: pixelX,
          top: pixelY,
          width: Math.max(gridWidth(MIN_W), pixelW),
          height: Math.max(gridHeight(MIN_H), pixelH),
          zIndex: dragOffset || resizeOffset ? 50 : "auto",
          cursor: "default",
        }}
        onPointerDown={handleDragStart}
      >
        {children}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize z-10 group"
          onPointerDown={handleResizeStart}
        >
          <svg
            className="absolute right-0.5 bottom-0.5 w-2.5 h-2.5 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
            viewBox="0 0 10 10"
            fill="currentColor"
          >
            <circle cx="8" cy="2" r="1.2" />
            <circle cx="8" cy="6" r="1.2" />
            <circle cx="4" cy="6" r="1.2" />
          </svg>
        </div>
      </div>
    </>
  );
}
