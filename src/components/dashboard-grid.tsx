"use client";

import { useMemo, useCallback, useState, useEffect } from "react";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import { LayoutGrid } from "lucide-react";
import { useWidgetStore } from "@/store/widget-store";
import { WidgetCard } from "@/components/widget-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
import { CreateWidgetDialog } from "@/components/create-widget-dialog";

const COLS = 12;
const ROW_HEIGHT = 80;
const MARGIN = 12;

export function DashboardGrid() {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useWidgetStore.persist.onFinishHydration(() => setHydrated(true));
    if (useWidgetStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, []);

  const widgets = useWidgetStore((s) => s.widgets);
  const updateLayouts = useWidgetStore((s) => s.updateLayouts);
  const removeWidget = useWidgetStore((s) => s.removeWidget);
  const { width, containerRef, mounted } = useContainerWidth();

  const handleRemove = useCallback(
    (id: string) => {
      removeWidget(id);
    },
    [removeWidget]
  );

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

  if (!hydrated) {
    return <div ref={containerRef} className="min-w-0 flex-1 w-full overflow-hidden" />;
  }

  return (
    <div ref={containerRef} className="min-w-0 flex-1 w-full overflow-hidden">
      {widgets.length === 0 ? (
        <Empty className="h-full">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="rounded-none bg-zinc-800 text-zinc-400">
              <LayoutGrid />
            </EmptyMedia>
            <EmptyTitle className="text-zinc-300 uppercase tracking-widest">
              No Widgets Yet
            </EmptyTitle>
            <EmptyDescription className="text-zinc-500 max-w-xs">
              Get started by adding your first widget to build out your
              monitoring dashboard.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <CreateWidgetDialog />
          </EmptyContent>
        </Empty>
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
                    <WidgetCard widget={widget} onRemove={handleRemove} />
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
