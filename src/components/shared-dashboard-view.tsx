"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Eye } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SharedTracePanel } from "@/components/shared-trace-panel";
import {
  CELL_H,
  CELL_W,
  InfiniteCanvas,
  MARGIN,
} from "@/components/infinite-canvas";
import { ZoomControls } from "@/components/zoom-controls";
import { DEFAULT_CANVAS_VIEWPORT } from "@/lib/canvas-viewport";
import type {
  PublishedCanvasLayout,
  PublishedTextBlockSnapshotV1,
  PublishedWidgetSnapshotV1,
  SharedSessionSnapshotV1,
} from "@/lib/share-types";
import {
  buildSharedSessionReplayFrames,
  buildSharedSessionReplaySnapshot,
} from "@/lib/share-types";

function formatTimestamp(value: string) {
  return value.replace(".000Z", "Z").replace("T", " ");
}

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

function fitViewport(
  items: Array<{ layout: PublishedCanvasLayout }>,
  width: number,
  height: number,
) {
  if (items.length === 0 || width === 0 || height === 0) {
    return DEFAULT_CANVAS_VIEWPORT;
  }

  const stepX = CELL_W + MARGIN;
  const stepY = CELL_H + MARGIN;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const item of items) {
    const left = item.layout.x * stepX;
    const top = item.layout.y * stepY;
    const right = left + item.layout.w * stepX - MARGIN;
    const bottom = top + item.layout.h * stepY - MARGIN;
    minX = Math.min(minX, left);
    minY = Math.min(minY, top);
    maxX = Math.max(maxX, right);
    maxY = Math.max(maxY, bottom);
  }

  const contentWidth = maxX - minX || stepX;
  const contentHeight = maxY - minY || stepY;
  const padding = 72;
  const zoom = Math.min(
    1,
    Math.min(
      (width - padding * 2) / contentWidth,
      (height - padding * 2) / contentHeight,
    ),
  );

  return {
    panX: (width - contentWidth * zoom) / 2 - minX * zoom,
    panY: (height - contentHeight * zoom) / 2 - minY * zoom,
    zoom,
  };
}

function PublishedWidgetCard({
  widget,
  active,
}: {
  widget: PublishedWidgetSnapshotV1;
  active: boolean;
}) {
  const pixelWidth = gridWidth(widget.layout.w);
  const pixelHeight = gridHeight(widget.layout.h);
  const iframeSrc = `/api/widget/${widget.publishedWidgetId}/?rev=${encodeURIComponent(widget.revision)}`;
  const hasApp = Boolean(widget.files["src/App.tsx"]);

  return (
    <div
      data-widget
      className="absolute"
      style={{
        left: gridToPixelX(widget.layout.x),
        top: gridToPixelY(widget.layout.y),
        width: pixelWidth,
        height: pixelHeight,
      }}
    >
      <Card className={`h-full gap-0 py-0 ${active ? "border-teal-500/40 bg-zinc-800 ring-teal-500/60" : "border-zinc-700 bg-zinc-800 ring-zinc-700"}`}>
        <div className="border-b border-zinc-700 px-3 py-2">
          <div className="truncate text-xs font-medium uppercase tracking-wider text-zinc-200">
            {widget.title}
          </div>
        </div>
        {hasApp ? (
          <CardContent className="relative flex-1 p-0!">
            <iframe
              src={iframeSrc}
              title={widget.title}
              className="absolute inset-0 h-full w-full border-0"
            />
          </CardContent>
        ) : (
          <CardContent className="flex-1 overflow-auto p-3">
            <p className="text-xs leading-relaxed text-zinc-400">
              {widget.description || "This widget does not have a shared app bundle yet."}
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function PublishedTextBlock({ textBlock }: { textBlock: PublishedTextBlockSnapshotV1 }) {
  return (
    <div
      data-widget
      className="absolute whitespace-pre-wrap break-words text-zinc-100"
      style={{
        left: gridToPixelX(textBlock.layout.x),
        top: gridToPixelY(textBlock.layout.y),
        width: gridWidth(textBlock.layout.w),
        minHeight: gridHeight(textBlock.layout.h),
        fontSize: `${textBlock.fontSize}px`,
        lineHeight: 1.2,
        fontWeight: textBlock.fontSize >= 32 ? 600 : 400,
      }}
    >
      {textBlock.text}
    </div>
  );
}

export function SharedDashboardView({
  snapshot,
  liveError,
}: {
  snapshot: SharedSessionSnapshotV1;
  liveError?: string | null;
}) {
  const [manualViewport, setManualViewport] = useState<{
    panX: number;
    panY: number;
    zoom: number;
  } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const replayFrames = useMemo(
    () => buildSharedSessionReplayFrames(snapshot.replayEvents),
    [snapshot.replayEvents],
  );
  const replayStepCount = replayFrames.length > 0 ? replayFrames.length - 1 : 0;
  const [replayFrameIndex, setReplayFrameIndex] = useState(replayStepCount);
  const previousReplayStepCountRef = useRef(replayStepCount);

  useEffect(() => {
    const previousReplayStepCount = previousReplayStepCountRef.current;
    if (replayStepCount === previousReplayStepCount) {
      return;
    }

    previousReplayStepCountRef.current = replayStepCount;
    setReplayFrameIndex((currentReplayFrameIndex) => {
      if (replayStepCount === 0) {
        return 0;
      }

      if (currentReplayFrameIndex >= previousReplayStepCount) {
        return replayStepCount;
      }

      return Math.min(currentReplayFrameIndex, replayStepCount);
    });
  }, [replayStepCount]);

  const effectiveSnapshot = useMemo(() => {
    if (replayFrames.length === 0) {
      return snapshot;
    }

    return buildSharedSessionReplaySnapshot(
      snapshot.shareId,
      snapshot.replayEvents,
      replayFrameIndex,
    );
  }, [replayFrameIndex, replayFrames.length, snapshot]);
  const dashboard = effectiveSnapshot.dashboard ?? snapshot.dashboard;
  const session = effectiveSnapshot.session;
  const currentReplayFrame = replayFrames[replayFrameIndex] ?? null;
  const activeReplayWidgetId = currentReplayFrame?.traceEvent?.publishedWidgetId
    ?? session.activeWidgetId
    ?? null;
  const canvasItems = useMemo(
    () => [
      ...(dashboard?.widgets ?? []),
      ...(dashboard?.textBlocks ?? []),
    ],
    [dashboard],
  );
  const liveAction = session.activeWidgetId
    ? session.currentActions[session.activeWidgetId] ?? null
    : null;
  const viewport = manualViewport
    ?? dashboard?.viewport
    ?? fitViewport(canvasItems, containerSize.width, containerSize.height);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      setContainerSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!dashboard) {
    return null;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-zinc-900">
      <header className="flex items-center justify-between gap-4 border-b border-zinc-800 px-5 py-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
            Shared Dashboard
          </div>
          <h1 className="truncate text-sm font-medium uppercase tracking-[0.18em] text-zinc-100">
            {dashboard.title}
          </h1>
        </div>
        <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          <span className="inline-flex items-center gap-1.5">
            <Eye className="h-3.5 w-3.5" />
            {liveAction ?? "Live sync"}
          </span>
          {dashboard.updatedAt && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatTimestamp(dashboard.updatedAt)}
            </span>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div ref={containerRef} className="relative min-h-0 flex-1 overflow-hidden">
          {canvasItems.length === 0 ? (
            <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
              No live items in this shared dashboard yet.
            </div>
          ) : (
            <>
              <InfiniteCanvas
                panX={viewport.panX}
                panY={viewport.panY}
                zoom={viewport.zoom}
                onViewportChange={(panX, panY, zoom) => setManualViewport({ panX, panY, zoom })}
              >
                {dashboard.widgets.map((widget) => (
                  <PublishedWidgetCard
                    key={`${widget.publishedWidgetId}:${widget.revision}`}
                    widget={widget}
                    active={activeReplayWidgetId === widget.publishedWidgetId}
                  />
                ))}
                {dashboard.textBlocks.map((textBlock) => (
                  <PublishedTextBlock key={textBlock.id} textBlock={textBlock} />
                ))}
              </InfiniteCanvas>
              <ZoomControls
                zoom={viewport.zoom}
                panX={viewport.panX}
                panY={viewport.panY}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                widgets={dashboard.widgets}
                textBlocks={dashboard.textBlocks}
                onViewportChange={(panX, panY, zoom) => setManualViewport({ panX, panY, zoom })}
              />
            </>
          )}
        </div>
        <SharedTracePanel
          key={snapshot.shareId}
          liveSession={snapshot.session}
          replaySession={session}
          replayFrames={replayFrames}
          replayFrameIndex={replayFrameIndex}
          onReplayFrameIndexChange={setReplayFrameIndex}
          liveError={liveError}
        />
      </div>
    </div>
  );
}
