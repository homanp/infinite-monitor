"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Conversation,
  ConversationContent,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { CELL_H, CELL_W, InfiniteCanvas, MARGIN } from "@/components/infinite-canvas";
import { ZoomControls } from "@/components/zoom-controls";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DEFAULT_CANVAS_VIEWPORT } from "@/lib/canvas-viewport";
import type {
  PublishedCanvasLayout,
  PublishedTextBlockSnapshotV1,
  PublishedWidgetSnapshotV1,
  SharedSessionSnapshotV1,
  SharedWidgetChat,
} from "@/lib/share-types";

function gridToPixelX(col: number) { return col * (CELL_W + MARGIN); }
function gridToPixelY(row: number) { return row * (CELL_H + MARGIN); }
function gridWidth(cols: number) { return cols * (CELL_W + MARGIN) - MARGIN; }
function gridHeight(rows: number) { return rows * (CELL_H + MARGIN) - MARGIN; }

function fitViewport(items: Array<{ layout: PublishedCanvasLayout }>, width: number, height: number) {
  if (items.length === 0 || width === 0 || height === 0) return DEFAULT_CANVAS_VIEWPORT;
  const stepX = CELL_W + MARGIN, stepY = CELL_H + MARGIN;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const item of items) {
    const l = item.layout.x * stepX, t = item.layout.y * stepY;
    minX = Math.min(minX, l); minY = Math.min(minY, t);
    maxX = Math.max(maxX, l + item.layout.w * stepX - MARGIN);
    maxY = Math.max(maxY, t + item.layout.h * stepY - MARGIN);
  }
  const cw = maxX - minX || stepX, ch = maxY - minY || stepY, pad = 72;
  const zoom = Math.min(1, Math.min((width - pad * 2) / cw, (height - pad * 2) / ch));
  return { panX: (width - cw * zoom) / 2 - minX * zoom, panY: (height - ch * zoom) / 2 - minY * zoom, zoom };
}

function PublishedWidgetCard({ widget, active, onSelect }: { widget: PublishedWidgetSnapshotV1; active: boolean; onSelect: (id: string) => void }) {
  const pw = gridWidth(widget.layout.w), ph = gridHeight(widget.layout.h);
  const hasApp = Boolean(widget.files["src/App.tsx"]);
  return (
    <div data-widget className="absolute" style={{ left: gridToPixelX(widget.layout.x), top: gridToPixelY(widget.layout.y), width: pw, height: ph }}>
      <Card className={`h-full gap-0 py-0 ${active ? "border-teal-500/40 bg-zinc-800 ring-teal-500/60" : "border-zinc-700 bg-zinc-800 ring-zinc-700"}`}>
        <button type="button" onClick={() => onSelect(widget.publishedWidgetId)} className="w-full border-b border-zinc-700 px-3 py-2 text-left transition-colors hover:bg-zinc-800/80">
          <div className="truncate text-xs font-medium uppercase tracking-wider text-zinc-200">{widget.title}</div>
        </button>
        {hasApp ? (
          <CardContent className="relative flex-1 p-0!">
            <iframe src={`/api/widget/${widget.publishedWidgetId}/?rev=${encodeURIComponent(widget.revision)}`} title={widget.title} className="absolute inset-0 h-full w-full border-0" />
          </CardContent>
        ) : (
          <CardContent className="flex-1 overflow-auto p-3">
            <p className="text-xs leading-relaxed text-zinc-400">{widget.description || "No shared app bundle yet."}</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

function PublishedTextBlock({ textBlock }: { textBlock: PublishedTextBlockSnapshotV1 }) {
  return (
    <div data-widget className="absolute whitespace-pre-wrap break-words text-zinc-100" style={{
      left: gridToPixelX(textBlock.layout.x), top: gridToPixelY(textBlock.layout.y),
      width: gridWidth(textBlock.layout.w), minHeight: gridHeight(textBlock.layout.h),
      fontSize: `${textBlock.fontSize}px`, lineHeight: 1.2, fontWeight: textBlock.fontSize >= 32 ? 600 : 400,
    }}>
      {textBlock.text}
    </div>
  );
}

export function SharedChatSidebar({ chats, selectedWidgetId, onClose }: { chats: SharedWidgetChat[]; selectedWidgetId: string | null; onClose: () => void }) {
  const activeChat = useMemo(() => {
    if (!selectedWidgetId) return null;
    return chats.find((c) => c.publishedWidgetId === selectedWidgetId) ?? null;
  }, [chats, selectedWidgetId]);

  if (!activeChat) return null;

  return (
    <aside className="relative flex h-full w-md flex-col border-l border-zinc-800 bg-black">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
        <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          {activeChat.widgetTitle}
        </div>
        <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-200 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <Conversation>
          <ConversationContent>
            {activeChat.messages.map((msg) => (
              <Fragment key={msg.id}>
                {msg.role === "assistant" && msg.reasoning && (
                  <details className="w-full mb-1 text-xs text-zinc-500">
                    <summary className="cursor-pointer hover:text-zinc-300 select-none">
                      Thought for {msg.reasoningDurationMs != null ? `${Math.round(msg.reasoningDurationMs / 1000)}s` : "a few seconds"}
                    </summary>
                    <div className="mt-1 whitespace-pre-wrap text-zinc-600 pl-2 border-l border-zinc-800">{msg.reasoning}</div>
                  </details>
                )}
                {(msg.role === "user" || msg.content) && (
                  <Message from={msg.role}>
                    <MessageContent><MessageResponse>{msg.content}</MessageResponse></MessageContent>
                  </Message>
                )}
              </Fragment>
            ))}
          </ConversationContent>
        </Conversation>
      </ScrollArea>
    </aside>
  );
}

export function SharedDashboardView({ snapshot, selectedWidgetId, onSelectWidgetId }: { snapshot: SharedSessionSnapshotV1; selectedWidgetId: string | null; onSelectWidgetId: (id: string) => void }) {
  const [manualViewport, setManualViewport] = useState<{ panX: number; panY: number; zoom: number } | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const dashboard = snapshot.dashboard;
  const canvasItems = useMemo(() => [...(dashboard?.widgets ?? []), ...(dashboard?.textBlocks ?? [])], [dashboard]);
  const viewport = manualViewport ?? dashboard?.viewport ?? fitViewport(canvasItems, containerSize.width, containerSize.height);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const e = entries[0];
      if (e) setContainerSize({ width: e.contentRect.width, height: e.contentRect.height });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (!dashboard) return null;

  return (
    <div className="flex-1 min-h-0 min-w-0">
      <div ref={containerRef} className="relative h-full overflow-hidden">
        {canvasItems.length === 0 ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">No live items yet.</div>
        ) : (
          <>
            <InfiniteCanvas panX={viewport.panX} panY={viewport.panY} zoom={viewport.zoom} onViewportChange={(px, py, z) => setManualViewport({ panX: px, panY: py, zoom: z })}>
              {dashboard.widgets.map((w) => <PublishedWidgetCard key={`${w.publishedWidgetId}:${w.revision}`} widget={w} active={selectedWidgetId === w.publishedWidgetId} onSelect={onSelectWidgetId} />)}
              {dashboard.textBlocks.map((tb) => <PublishedTextBlock key={tb.id} textBlock={tb} />)}
            </InfiniteCanvas>
            <ZoomControls zoom={viewport.zoom} panX={viewport.panX} panY={viewport.panY} containerWidth={containerSize.width} containerHeight={containerSize.height} widgets={dashboard.widgets} textBlocks={dashboard.textBlocks} onViewportChange={(px, py, z) => setManualViewport({ panX: px, panY: py, zoom: z })} />
          </>
        )}
      </div>
    </div>
  );
}
