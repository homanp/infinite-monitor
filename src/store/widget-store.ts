import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayoutItem } from "react-grid-layout";

export interface Widget {
  id: string;
  title: string;
  description: string;
  layout: LayoutItem;
}

interface WidgetStore {
  widgets: Widget[];
  addWidget: (title: string, description: string) => void;
  removeWidget: (id: string) => void;
  updateLayouts: (layouts: readonly LayoutItem[]) => void;
}

let counter = 0;

function generateId() {
  return `widget-${Date.now()}-${counter++}`;
}

function getNextPosition(widgets: Widget[]): { x: number; y: number } {
  if (widgets.length === 0) return { x: 0, y: 0 };

  let maxY = 0;
  let xAtMaxY = 0;
  let hAtMaxY = 0;

  for (const w of widgets) {
    const bottom = w.layout.y + w.layout.h;
    if (bottom > maxY + hAtMaxY) {
      maxY = w.layout.y;
      xAtMaxY = w.layout.x + w.layout.w;
      hAtMaxY = w.layout.h;
    } else if (w.layout.y === maxY) {
      const right = w.layout.x + w.layout.w;
      if (right > xAtMaxY) xAtMaxY = right;
    }
  }

  if (xAtMaxY + 4 <= 12) {
    return { x: xAtMaxY, y: maxY };
  }

  return { x: 0, y: maxY + hAtMaxY };
}

export const useWidgetStore = create<WidgetStore>()(
  persist(
    (set, get) => ({
      widgets: [],

      addWidget: (title, description) => {
        const { widgets } = get();
        const pos = getNextPosition(widgets);
        const id = generateId();

        const widget: Widget = {
          id,
          title,
          description,
          layout: {
            i: id,
            x: pos.x,
            y: pos.y,
            w: 4,
            h: 3,
            minW: 2,
            minH: 2,
          },
        };

        set({ widgets: [...widgets, widget] });
      },

      removeWidget: (id) => {
        set({ widgets: get().widgets.filter((w) => w.id !== id) });
      },

      updateLayouts: (layouts) => {
        const { widgets } = get();
        const updated = widgets.map((widget) => {
          const layoutItem = layouts.find((l) => l.i === widget.id);
          if (layoutItem) {
            return { ...widget, layout: { ...layoutItem } };
          }
          return widget;
        });
        set({ widgets: updated });
      },
    }),
    {
      name: "infinite-monitor-widgets",
    }
  )
);
