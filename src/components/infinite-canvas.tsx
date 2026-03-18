"use client";

import {
  useRef,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

export const CELL_W = 120;
export const CELL_H = 80;
export const MARGIN = 12;

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3.0;

interface InfiniteCanvasProps {
  panX: number;
  panY: number;
  zoom: number;
  onViewportChange: (panX: number, panY: number, zoom: number) => void;
  children: ReactNode;
}

export function InfiniteCanvas({
  panX,
  panY,
  zoom,
  onViewportChange,
  children,
}: InfiniteCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const viewportRef = useRef({ panX, panY, zoom });
  const onViewportChangeRef = useRef(onViewportChange);

  useEffect(() => {
    viewportRef.current = { panX, panY, zoom };
  }, [panX, panY, zoom]);

  useEffect(() => {
    onViewportChangeRef.current = onViewportChange;
  }, [onViewportChange]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { panX: px, panY: py, zoom: z } = viewportRef.current;
      const emit = onViewportChangeRef.current;

      if (e.ctrlKey || e.metaKey) {
        const rect = el.getBoundingClientRect();
        const cursorX = e.clientX - rect.left;
        const cursorY = e.clientY - rect.top;

        const direction = e.deltaY > 0 ? -1 : e.deltaY < 0 ? 1 : 0;
        const magnitude = Math.abs(e.deltaY);
        const factor = 1 + direction * Math.max(0.02, magnitude * 0.03);
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));

        const worldX = (cursorX - px) / z;
        const worldY = (cursorY - py) / z;

        viewportRef.current = {
          panX: cursorX - worldX * newZoom,
          panY: cursorY - worldY * newZoom,
          zoom: newZoom,
        };
        emit(viewportRef.current.panX, viewportRef.current.panY, newZoom);
      } else {
        const newPanX = px - e.deltaX;
        const newPanY = py - e.deltaY;
        viewportRef.current = { panX: newPanX, panY: newPanY, zoom: z };
        emit(newPanX, newPanY, z);
      }
    };

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      const isCanvasBg =
        e.button === 1 ||
        (e.button === 0 &&
          (e.target as HTMLElement).closest("[data-canvas-bg]") !== null &&
          !(e.target as HTMLElement).closest("[data-widget]"));
      if (!isCanvasBg) return;
      setIsPanning(true);
      panStart.current = { x: e.clientX, y: e.clientY, panX, panY };
      containerRef.current!.setPointerCapture(e.pointerId);
    },
    [panX, panY]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      onViewportChange(panStart.current.panX + dx, panStart.current.panY + dy, zoom);
    },
    [isPanning, zoom, onViewportChange]
  );

  const handlePointerUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const DOT_SPACING = 22;
  const scaledSpacing = DOT_SPACING * zoom;
  const gridBg = `radial-gradient(circle, rgba(255,255,255,0.10) ${0.8 * zoom}px, transparent ${0.8 * zoom}px)`;

  return (
    <div
      ref={containerRef}
      data-canvas-bg
      className="relative w-full h-full overflow-hidden"
      style={{
        cursor: isPanning ? "grabbing" : "grab",
        backgroundImage: gridBg,
        backgroundSize: `${scaledSpacing}px ${scaledSpacing}px`,
        backgroundPosition: `${panX}px ${panY}px`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div
        data-canvas-bg
        style={{
          position: "absolute",
          transformOrigin: "0 0",
          transform: `translate(${panX}px, ${panY}px) scale(${zoom})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}
