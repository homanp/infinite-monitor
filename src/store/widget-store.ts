import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { LayoutItem } from "react-grid-layout";

export interface WidgetMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
}

export interface Widget {
  id: string;
  title: string;
  description: string;
  messages: WidgetMessage[];
  layout: LayoutItem;
  // WebContainer: files written by the agent (persisted to localStorage)
  files: Record<string, string> | null;
  // Current session preview URL (WebContainer URL, not persisted)
  previewUrl: string | null;
}

interface WidgetStore {
  widgets: Widget[];
  activeWidgetId: string | null;
  streamingWidgetIds: string[];
  currentActions: Record<string, string>;
  reasoningStreamingIds: string[];
  addWidget: (title?: string, description?: string) => string;
  addMessage: (widgetId: string, message: WidgetMessage) => void;
  renameWidget: (id: string, title: string) => void;
  setWidgetFile: (widgetId: string, path: string, content: string) => void;
  setPreviewUrl: (widgetId: string, url: string) => void;
  clearWidgetFiles: (widgetId: string) => void;
  setStreaming: (widgetId: string, streaming: boolean) => void;
  setCurrentAction: (widgetId: string, action: string | null) => void;
  appendReasoningToMessage: (widgetId: string, messageId: string, text: string) => void;
  setReasoningStreaming: (widgetId: string, streaming: boolean) => void;
  removeWidget: (id: string) => void;
  setActiveWidget: (id: string | null) => void;
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
      activeWidgetId: null,
      streamingWidgetIds: [],
      currentActions: {},
      reasoningStreamingIds: [],

      addWidget: (title = "Untitled Widget", description = "") => {
        const { widgets } = get();
        const pos = getNextPosition(widgets);
        const id = generateId();

        const widget: Widget = {
          id,
          title,
          description,
          messages: [],
          files: null,
          previewUrl: null,
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

      setWidgetFile: (widgetId, path, content) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? { ...w, files: { ...(w.files ?? {}), [path]: content } }
              : w
          ),
        });
      },

      setPreviewUrl: (widgetId, url) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId ? { ...w, previewUrl: url } : w
          ),
        });
      },

      clearWidgetFiles: (widgetId) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? { ...w, files: null, previewUrl: null }
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
    }),
    {
      name: "infinite-monitor-widgets",
      merge: (persisted, current) => {
        const stored = persisted as Partial<WidgetStore> | undefined;
        if (!stored) return current;
        return {
          ...current,
          ...stored,
          streamingWidgetIds: [],
          currentActions: {},
          reasoningStreamingIds: [],
          widgets: (stored.widgets ?? []).map((w) => ({
            ...w,
            files: w.files ?? null,
            previewUrl: null, // never persist WC URLs across sessions
            messages: (w.messages ?? []).map((m) => ({
              ...m,
              reasoning: m.reasoning ?? undefined,
            })),
          })),
        };
      },
    }
  )
);
