"use client";

import { useMemo, useCallback } from "react";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { useWidgetStore } from "@/store/widget-store";
import { WidgetCard } from "@/components/widget-card";
import { ScrollArea } from "@/components/ui/scroll-area";

const COLS = 12;
const ROW_HEIGHT = 80;
const MARGIN = 12;

export function DashboardGrid() {
  const widgets = useWidgetStore((s) => s.widgets);
  const updateLayouts = useWidgetStore((s) => s.updateLayouts);
  const removeWidget = useWidgetStore((s) => s.removeWidget);
  const { width, containerRef, mounted } = useContainerWidth();

  const layout: Layout = useMemo(
    () => widgets.map((w) => ({ ...w.layout })),
    [widgets]
  );

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      updateLayouts(newLayout);
    },
    [updateLayouts]
  );

  return (
    <div ref={containerRef} className="flex-1 w-full overflow-hidden">
      {widgets.length === 0 ? (
        <div className="h-full flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="text-zinc-600 text-sm uppercase tracking-widest">
              No widgets yet
            </div>
            <p className="text-zinc-700 text-xs max-w-xs">
              Click &quot;Add Widget&quot; to create your first widget and start
              building your dashboard.
            </p>
          </div>
        </div>
      ) : (
        <ScrollArea className="h-full w-full">
          <div className="px-5 pt-1">
            {mounted && (
              <GridLayout
                className="layout"
                layout={layout}
                width={width - 40}
                gridConfig={{
                  cols: COLS,
                  rowHeight: ROW_HEIGHT,
                  margin: [MARGIN, MARGIN] as const,
                  containerPadding: [0, 0] as const,
                }}
                dragConfig={{
                  handle: ".drag-handle",
                }}
                resizeConfig={{
                  enabled: true,
                }}
                onLayoutChange={handleLayoutChange}
              >
                {widgets.map((widget) => (
                  <div key={widget.id} className="relative h-full">
                    <WidgetCard widget={widget} onRemove={removeWidget} />
                  </div>
                ))}
              </GridLayout>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
