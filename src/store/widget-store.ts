import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayoutItem } from "react-grid-layout";

export interface MessageAttachment {
  name: string;
  type: string;
  size: number;
  url: string;
}

export interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
  attachments?: MessageAttachment[];
}

export interface Widget {
  id: string;
  title: string;
  description: string;
  messages: WidgetMessage[];
  layout: LayoutItem;
  code: string | null;
  files: Record<string, string>;
  iframeVersion: number;
}

export interface Dashboard {
  id: string;
  title: string;
  widgetIds: string[];
  createdAt: number;
}

interface WidgetStore {
  dashboards: Dashboard[];
  activeDashboardId: string | null;
  widgets: Widget[];
  activeWidgetId: string | null;
  streamingWidgetIds: string[];
  currentActions: Record<string, string>;
  reasoningStreamingIds: string[];

  addDashboard: (title?: string) => string;
  renameDashboard: (id: string, title: string) => void;
  removeDashboard: (id: string) => void;
  setActiveDashboard: (id: string | null) => void;

  addWidget: (title?: string, description?: string) => string;
  addMessage: (widgetId: string, message: WidgetMessage) => void;
  renameWidget: (id: string, title: string) => void;
  setWidgetCode: (widgetId: string, code: string) => void;
  setWidgetFile: (widgetId: string, path: string, content: string) => void;
  deleteWidgetFile: (widgetId: string, path: string) => void;
  clearWidgetCode: (widgetId: string) => void;
  bumpIframeVersion: (widgetId: string) => void;
  setStreaming: (widgetId: string, streaming: boolean) => void;
  setCurrentAction: (widgetId: string, action: string | null) => void;
  appendReasoningToMessage: (widgetId: string, messageId: string, text: string) => void;
  setReasoningStreaming: (widgetId: string, streaming: boolean) => void;
  removeWidget: (id: string) => void;
  setActiveWidget: (id: string | null) => void;
  updateLayouts: (layouts: readonly LayoutItem[]) => void;
  applyTemplate: (template: {
    widgets: Array<{
      title: string;
      description: string;
      code: string;
      files: Record<string, string>;
      layoutJson: string | null;
    }>;
  }) => void;
}

let counter = 0;

function generateId(prefix = "widget") {
  return `${prefix}-${Date.now()}-${counter++}`;
}

export function getNextPosition(widgets: Widget[], widgetIds: string[]): { x: number; y: number } {
  const dashboardWidgets = widgets.filter((w) => widgetIds.includes(w.id));
  if (dashboardWidgets.length === 0) return { x: 0, y: 0 };

  let maxY = 0;
  let xAtMaxY = 0;
  let hAtMaxY = 0;

  for (const w of dashboardWidgets) {
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
      dashboards: [],
      activeDashboardId: null,
      widgets: [],
      activeWidgetId: null,
      streamingWidgetIds: [],
      currentActions: {},
      reasoningStreamingIds: [],

      addDashboard: (title = "Dashboard") => {
        const id = generateId("dash");
        set((state) => ({
          dashboards: [...state.dashboards, { id, title, widgetIds: [], createdAt: Date.now() }],
          activeDashboardId: id,
        }));
        return id;
      },

      renameDashboard: (id, title) => {
        set((state) => ({
          dashboards: state.dashboards.map((d) =>
            d.id === id ? { ...d, title } : d
          ),
        }));
      },

      removeDashboard: (id) => {
        const dashboard = get().dashboards.find((d) => d.id === id);
        const widgetIds = dashboard?.widgetIds ?? [];
        set((state) => {
          const nextActions = { ...state.currentActions };
          for (const wid of widgetIds) delete nextActions[wid];
          return {
            dashboards: state.dashboards.filter((d) => d.id !== id),
            widgets: state.widgets.filter((w) => !widgetIds.includes(w.id)),
            activeDashboardId: state.activeDashboardId === id ? null : state.activeDashboardId,
            activeWidgetId: widgetIds.includes(state.activeWidgetId ?? "") ? null : state.activeWidgetId,
            streamingWidgetIds: state.streamingWidgetIds.filter((wid) => !widgetIds.includes(wid)),
            reasoningStreamingIds: state.reasoningStreamingIds.filter((wid) => !widgetIds.includes(wid)),
            currentActions: nextActions,
          };
        });
      },

      setActiveDashboard: (id) => {
        set({ activeDashboardId: id });
      },

      addWidget: (title = "Untitled Widget", description = "") => {
        const { widgets, dashboards, activeDashboardId } = get();
        let dashId = activeDashboardId;

        // Auto-create a default dashboard if none exists
        if (!dashId || !dashboards.find((d) => d.id === dashId)) {
          dashId = generateId("dash");
          set((state) => ({
            dashboards: [...state.dashboards, { id: dashId!, title: "Dashboard", widgetIds: [], createdAt: Date.now() }],
            activeDashboardId: dashId,
          }));
        }

        const dashboard = get().dashboards.find((d) => d.id === dashId);
        const pos = getNextPosition(widgets, dashboard?.widgetIds ?? []);
        const id = generateId("widget");

        const widget: Widget = {
          id,
          title,
          description,
          messages: [],
          code: null,
          files: {},
          iframeVersion: 0,
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

        set((state) => ({
          widgets: [...state.widgets, widget],
          dashboards: state.dashboards.map((d) =>
            d.id === dashId ? { ...d, widgetIds: [...d.widgetIds, id] } : d
          ),
        }));
        return id;
      },

      addMessage: (widgetId, message) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? { ...w, messages: [...w.messages, message] }
              : w
          ),
        });
      },

      renameWidget: (id, title) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === id ? { ...w, title } : w
          ),
        });
      },

      setWidgetCode: (widgetId, code) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? { ...w, code, files: { ...w.files, "src/App.tsx": code } }
              : w
          ),
        });
      },

      setWidgetFile: (widgetId, path, content) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? { ...w, files: { ...w.files, [path]: content } }
              : w
          ),
        });
      },

      deleteWidgetFile: (widgetId, path) => {
        set({
          widgets: get().widgets.map((w) => {
            if (w.id !== widgetId) return w;
            const files = { ...w.files };
            delete files[path];
            return { ...w, files };
          }),
        });
      },

      clearWidgetCode: (widgetId) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId ? { ...w, code: null, iframeVersion: 0 } : w
          ),
        });
      },

      bumpIframeVersion: (widgetId) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? { ...w, iframeVersion: w.iframeVersion + 1 }
              : w
          ),
        });
      },

      setStreaming: (widgetId, streaming) => {
        set((state) => ({
          streamingWidgetIds: streaming
            ? [...state.streamingWidgetIds.filter((id) => id !== widgetId), widgetId]
            : state.streamingWidgetIds.filter((id) => id !== widgetId),
        }));
      },

      setCurrentAction: (widgetId, action) => {
        set((state) => {
          const next = { ...state.currentActions };
          if (action === null) {
            delete next[widgetId];
          } else {
            next[widgetId] = action;
          }
          return { currentActions: next };
        });
      },

      appendReasoningToMessage: (widgetId, messageId, text) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? {
                  ...w,
                  messages: w.messages.map((m) =>
                    m.id === messageId
                      ? { ...m, reasoning: (m.reasoning ?? "") + text }
                      : m
                  ),
                }
              : w
          ),
        });
      },

      setReasoningStreaming: (widgetId, streaming) => {
        set((state) => ({
          reasoningStreamingIds: streaming
            ? [...state.reasoningStreamingIds.filter((id) => id !== widgetId), widgetId]
            : state.reasoningStreamingIds.filter((id) => id !== widgetId),
        }));
      },

      removeWidget: (id) => {
        set((state) => {
          const nextActions = { ...state.currentActions };
          delete nextActions[id];
          return {
            widgets: state.widgets.filter((w) => w.id !== id),
            dashboards: state.dashboards.map((d) => ({
              ...d,
              widgetIds: d.widgetIds.filter((wid) => wid !== id),
            })),
            activeWidgetId:
              state.activeWidgetId === id ? null : state.activeWidgetId,
            streamingWidgetIds: state.streamingWidgetIds.filter((wid) => wid !== id),
            reasoningStreamingIds: state.reasoningStreamingIds.filter((wid) => wid !== id),
            currentActions: nextActions,
          };
        });
      },

      setActiveWidget: (id) => {
        set({ activeWidgetId: id });
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

      applyTemplate: (template) => {
        const { dashboards, activeDashboardId } = get();
        let dashId = activeDashboardId;

        if (!dashId || !dashboards.find((d) => d.id === dashId)) {
          dashId = generateId("dash");
          set((state) => ({
            dashboards: [...state.dashboards, { id: dashId!, title: "Dashboard", widgetIds: [], createdAt: Date.now() }],
            activeDashboardId: dashId,
          }));
        }

        const newWidgets: Widget[] = template.widgets.map((tw) => {
          const id = generateId("widget");
          const layout = tw.layoutJson ? JSON.parse(tw.layoutJson) : { x: 0, y: 0, w: 4, h: 3, minW: 2, minH: 2 };
          return {
            id,
            title: tw.title,
            description: tw.description,
            messages: [],
            code: tw.code,
            files: tw.files,
            iframeVersion: 0,
            layout: { ...layout, i: id },
          };
        });

        set((state) => ({
          widgets: [...state.widgets, ...newWidgets],
          dashboards: state.dashboards.map((d) =>
            d.id === dashId ? { ...d, widgetIds: [...d.widgetIds, ...newWidgets.map((w) => w.id)] } : d
          ),
        }));

        fetch("/api/widgets/bootstrap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            widgets: newWidgets.map((w) => ({
              id: w.id,
              title: w.title,
              description: w.description,
              code: w.code,
              files: w.files,
            })),
          }),
        }).catch(console.error);
      },
    }),
    {
      name: "infinite-monitor-widgets",
      merge: (persisted, current) => {
        const stored = persisted as Partial<WidgetStore> | undefined;
        if (!stored) return current;

        const widgets = (stored.widgets ?? []).map((w) => ({
          ...w,
          code: w.code ?? null,
          files: w.files ?? {},
          iframeVersion: w.iframeVersion ?? 0,
          messages: (w.messages ?? []).map((m) => ({
            ...m,
            reasoning: m.reasoning ?? undefined,
          })),
        }));

        // Migrate from old format: if no dashboards exist but widgets do, create a default
        let dashboards = stored.dashboards ?? [];
        if (dashboards.length === 0 && widgets.length > 0) {
          dashboards = [{
            id: generateId("dash"),
            title: "Dashboard",
            widgetIds: widgets.map((w) => w.id),
            createdAt: Date.now(),
          }];
        }

        return {
          ...current,
          ...stored,
          dashboards,
          activeDashboardId: stored.activeDashboardId ?? dashboards[0]?.id ?? null,
          streamingWidgetIds: [],
          currentActions: {},
          reasoningStreamingIds: [],
          widgets,
        };
      },
    }
  )
);
