"use client";

import { useMemo, useCallback, useState, useEffect, useRef } from "react";
import { LayoutGrid, TrendingUp, Shield, Globe } from "lucide-react";
import { useWidgetStore } from "@/store/widget-store";
import { WidgetCard } from "@/components/widget-card";
import { TextBlockItem } from "@/components/text-block-item";
import { deleteWidgetFromDb, deleteTextBlockFromDb, scheduleSyncToServer } from "@/lib/sync-db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AddMenu } from "@/components/add-menu";
import { CELL_W, CELL_H, MARGIN, InfiniteCanvas } from "@/components/infinite-canvas";
import { DraggableWidget } from "@/components/draggable-widget";
import { ZoomControls } from "@/components/zoom-controls";
import type { CanvasLayout } from "@/store/widget-store";

interface Template {
  name: string;
  description: string;
  icon: string;
  widgetCount: number;
  widgets: Array<{
    title: string;
    description: string;
    code: string;
    files: Record<string, string>;
    layoutJson: string | null;
  }>;
}

const ICON_MAP: Record<string, typeof TrendingUp> = {
  trending: TrendingUp,
  globe: Globe,
  shield: Shield,
};

function TemplateGallery({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const applyTemplate = useWidgetStore((s) => s.applyTemplate);
  const renameDashboard = useWidgetStore((s) => s.renameDashboard);
  const setViewport = useWidgetStore((s) => s.setViewport);
  const activeDashboardId = useWidgetStore((s) => s.activeDashboardId);
  const containerEl = containerRef.current;

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => r.json())
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleApply = async (template: Template) => {
    setApplying(template.name);
    applyTemplate(template);
    if (activeDashboardId) {
      renameDashboard(activeDashboardId, template.name);
    }

    // Fit-to-view after applying template
    if (activeDashboardId && containerEl) {
      const stepX = CELL_W + MARGIN;
      const stepY = CELL_H + MARGIN;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const w of template.widgets) {
        const layout = w.layoutJson ? JSON.parse(w.layoutJson) : { x: 0, y: 0, w: 4, h: 3 };
        const px = layout.x * stepX;
        const py = layout.y * stepY;
        const pw = layout.w * stepX - MARGIN;
        const ph = layout.h * stepY - MARGIN;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px + pw);
        maxY = Math.max(maxY, py + ph);
      }
      const contentW = maxX - minX;
      const contentH = maxY - minY;
      const padding = 60;
      const cw = containerEl.clientWidth;
      const ch = containerEl.clientHeight;
      const fitZoom = Math.min(1, Math.min((cw - padding * 2) / contentW, (ch - padding * 2) / contentH));
      const fitPanX = (cw - contentW * fitZoom) / 2 - minX * fitZoom;
      const fitPanY = (ch - contentH * fitZoom) / 2 - minY * fitZoom;
      setViewport(activeDashboardId, { panX: fitPanX, panY: fitPanY, zoom: fitZoom });
    }

    scheduleSyncToServer({ dirtyDashboardIds: activeDashboardId ? [activeDashboardId] : [] });
    setApplying(null);
  };

  if (loading) {
    return (
      <div className="w-full max-w-5xl mx-auto px-8">
        <p className="text-[11px] text-zinc-600 uppercase tracking-wider mb-4">Templates</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 bg-zinc-800/30 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (templates.length === 0) return null;

  return (
    <div className="w-full max-w-5xl mx-auto px-8">
      <p className="text-[11px] text-zinc-600 uppercase tracking-wider mb-4">Or start from a template</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {templates.map((template) => {
          const Icon = ICON_MAP[template.icon] || LayoutGrid;
          const isApplying = applying === template.name;
          return (
            <button
              key={template.name}
              onClick={() => handleApply(template)}
              disabled={isApplying}
              className="group relative flex flex-col bg-zinc-900/30 border border-zinc-800 hover:border-zinc-600 hover:bg-zinc-900/60 transition-all text-left disabled:opacity-50 overflow-hidden"
            >
              <div className="flex flex-col gap-2 p-5">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
                  <span className="text-xs font-medium uppercase tracking-wider text-zinc-300">
                    {template.name}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-relaxed">
                  {template.description}
                </p>
                <div className="text-[10px] text-zinc-600">
                  {template.widgetCount} widgets
                </div>
              </div>
              {isApplying && (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/80">
                  <span className="text-xs text-zinc-400 animate-pulse">Loading...</span>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DashboardGrid() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useWidgetStore.persist.onFinishHydration(() => setHydrated(true));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- needed for Zustand hydration check
    if (useWidgetStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  const allWidgets = useWidgetStore((s) => s.widgets);
  const allTextBlocks = useWidgetStore((s) => s.textBlocks);
  const dashboards = useWidgetStore((s) => s.dashboards);
  const activeDashboardId = useWidgetStore((s) => s.activeDashboardId);
  const updateWidgetLayout = useWidgetStore((s) => s.updateWidgetLayout);
  const removeWidget = useWidgetStore((s) => s.removeWidget);
  const updateTextBlock = useWidgetStore((s) => s.updateTextBlock);
  const updateTextBlockLayout = useWidgetStore((s) => s.updateTextBlockLayout);
  const removeTextBlock = useWidgetStore((s) => s.removeTextBlock);
  const viewports = useWidgetStore((s) => s.viewports);
  const setViewport = useWidgetStore((s) => s.setViewport);

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId);

  const widgets = useMemo(() => {
    if (!activeDashboard) return allWidgets;
    return allWidgets.filter((w) => activeDashboard.widgetIds.includes(w.id));
  }, [allWidgets, activeDashboard]);

  const textBlocks = useMemo(() => {
    if (!activeDashboard) return allTextBlocks;
    return allTextBlocks.filter((tb) => (activeDashboard.textBlockIds ?? []).includes(tb.id));
  }, [allTextBlocks, activeDashboard]);

  const DEFAULT_VIEWPORT = { panX: 24, panY: 60, zoom: 1 };

  const viewport = activeDashboardId
    ? viewports[activeDashboardId] ?? DEFAULT_VIEWPORT
    : DEFAULT_VIEWPORT;

  const handleViewportChange = useCallback(
    (panX: number, panY: number, zoom: number) => {
      if (activeDashboardId) {
        setViewport(activeDashboardId, { panX, panY, zoom });
      }
    },
    [activeDashboardId, setViewport]
  );

  const handleRemove = useCallback(
    (id: string) => {
      removeWidget(id);
      deleteWidgetFromDb(id);
    },
    [removeWidget]
  );

  const handleLayoutChange = useCallback(
    (widgetId: string, layout: CanvasLayout) => {
      updateWidgetLayout(widgetId, layout);
      scheduleSyncToServer({ urgency: "interactive", dirtyDashboardIds: activeDashboardId ? [activeDashboardId] : [] });
    },
    [updateWidgetLayout, activeDashboardId]
  );

  const handleTextBlockTextChange = useCallback(
    (id: string, text: string) => {
      updateTextBlock(id, { text });
      scheduleSyncToServer({ dirtyDashboardIds: activeDashboardId ? [activeDashboardId] : [] });
    },
    [updateTextBlock, activeDashboardId]
  );

  const handleTextBlockFontSizeChange = useCallback(
    (id: string, fontSize: number) => {
      updateTextBlock(id, { fontSize });
      scheduleSyncToServer({ dirtyDashboardIds: activeDashboardId ? [activeDashboardId] : [] });
    },
    [updateTextBlock, activeDashboardId]
  );

  const handleTextBlockLayoutChange = useCallback(
    (id: string, layout: CanvasLayout) => {
      updateTextBlockLayout(id, layout);
      scheduleSyncToServer({ dirtyDashboardIds: activeDashboardId ? [activeDashboardId] : [] });
    },
    [updateTextBlockLayout, activeDashboardId]
  );

  const handleRemoveTextBlock = useCallback(
    (id: string) => {
      removeTextBlock(id);
      deleteTextBlockFromDb(id);
    },
    [removeTextBlock]
  );

  if (!hydrated) {
    return <div ref={containerRef} className="min-w-0 flex-1 w-full overflow-hidden" />;
  }

  return (
    <div ref={containerRef} className="min-w-0 flex-1 w-full overflow-hidden relative">
      {widgets.length === 0 && textBlocks.length === 0 ? (
        <ScrollArea className="h-full w-full">
          <div className="flex flex-col items-center justify-center min-h-full py-16 gap-12">
            <div className="flex flex-col items-center gap-1.5 text-center">
              <div className="flex items-center justify-center w-10 h-10 bg-zinc-800 text-zinc-400 mb-2">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div className="text-sm font-medium text-zinc-300 uppercase tracking-widest">
                No Widgets Yet
              </div>
              <p className="text-xs text-zinc-500 max-w-xs">
                Get started by adding your first widget or pick a template below.
              </p>
              <div className="mt-3">
                <AddMenu />
              </div>
            </div>
            <TemplateGallery containerRef={containerRef} />
          </div>
        </ScrollArea>
      ) : (
        <>
          <InfiniteCanvas
            panX={viewport.panX}
            panY={viewport.panY}
            zoom={viewport.zoom}
            onViewportChange={handleViewportChange}
          >
            {widgets.map((widget) => (
              <DraggableWidget
                key={widget.id}
                x={widget.layout.x}
                y={widget.layout.y}
                w={widget.layout.w}
                h={widget.layout.h}
                zoom={viewport.zoom}
                onLayoutChange={(layout) => handleLayoutChange(widget.id, layout)}
              >
                <WidgetCard widget={widget} onRemove={handleRemove} />
              </DraggableWidget>
            ))}
            {textBlocks.map((tb) => (
              <TextBlockItem
                key={tb.id}
                id={tb.id}
                text={tb.text}
                fontSize={tb.fontSize}
                layout={tb.layout}
                zoom={viewport.zoom}
                onTextChange={(text) => handleTextBlockTextChange(tb.id, text)}
                onFontSizeChange={(fs) => handleTextBlockFontSizeChange(tb.id, fs)}
                onLayoutChange={(layout) => handleTextBlockLayoutChange(tb.id, layout)}
                onRemove={() => handleRemoveTextBlock(tb.id)}
              />
            ))}
          </InfiniteCanvas>
          <ZoomControls
            zoom={viewport.zoom}
            panX={viewport.panX}
            panY={viewport.panY}
            containerWidth={containerSize.width}
            containerHeight={containerSize.height}
            widgets={widgets}
            textBlocks={textBlocks}
            onViewportChange={handleViewportChange}
          />
        </>
      )}
    </div>
  );
}
