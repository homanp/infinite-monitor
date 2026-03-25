import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_CANVAS_VIEWPORT } from "@/lib/canvas-viewport";
import {
  configureSyncPayloadProvider,
  type SyncPayload,
  type SyncUrgency,
} from "@/lib/sync-db";

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

export interface CanvasLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CanvasViewport {
  panX: number;
  panY: number;
  zoom: number;
}

export interface Widget {
  id: string;
  title: string;
  description: string;
  messages: WidgetMessage[];
  layout: CanvasLayout;
  code: string | null;
  files: Record<string, string>;
  iframeVersion: number;
}

export interface TextBlock {
  id: string;
  text: string;
  fontSize: number;
  layout: CanvasLayout;
}

export interface Dashboard {
  id: string;
  title: string;
  widgetIds: string[];
  textBlockIds: string[];
  createdAt: number;
}

export interface SavedShare {
  shareId: string;
  title: string;
  savedAt: number;
}

interface WidgetStore {
  dashboards: Dashboard[];
  activeDashboardId: string | null;
  savedShares: SavedShare[];
  widgets: Widget[];
  textBlocks: TextBlock[];
  activeWidgetId: string | null;
  streamingWidgetIds: string[];
  currentActions: Record<string, string>;
  reasoningStreamingIds: string[];
  viewports: Record<string, CanvasViewport>;

  addDashboard: (title?: string) => string;
  renameDashboard: (id: string, title: string) => void;
  removeDashboard: (id: string) => void;
  setActiveDashboard: (id: string | null) => void;

  addWidget: (title?: string, description?: string) => string;
  addMessage: (widgetId: string, message: WidgetMessage) => void;
  updateMessageContent: (widgetId: string, messageId: string, content: string) => void;
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
  updateWidgetLayout: (id: string, layout: Partial<CanvasLayout>) => void;
  setViewport: (dashboardId: string, viewport: CanvasViewport) => void;
  applyTemplate: (template: {
    widgets: Array<{
      title: string;
      description: string;
      code: string;
      files: Record<string, string>;
      layoutJson: string | null;
    }>;
  }) => void;

  saveShare: (shareId: string, title: string) => void;
  removeShare: (shareId: string) => void;

  addTextBlock: (position?: { x: number; y: number }) => string;
  updateTextBlock: (id: string, updates: Partial<Pick<TextBlock, "text" | "fontSize">>) => void;
  updateTextBlockLayout: (id: string, layout: Partial<CanvasLayout>) => void;
  removeTextBlock: (id: string) => void;
}

let counter = 0;

function generateId(prefix = "widget") {
  return `${prefix}-${Date.now()}-${counter++}`;
}

function migrateViewports(
  viewports: Record<string, CanvasViewport> | undefined
): Record<string, CanvasViewport> {
  if (!viewports) return {};
  const migrated: Record<string, CanvasViewport> = {};
  for (const [id, vp] of Object.entries(viewports)) {
    if (vp.panX === 0 && vp.panY === 0 && vp.zoom === 1) continue;
    migrated[id] = vp;
  }
  return migrated;
}

export function shiftItemsDown(
  widgets: Widget[],
  widgetIds: string[],
  textBlocks: TextBlock[],
  textBlockIds: string[],
  amount: number,
): { widgets: Widget[]; textBlocks: TextBlock[] } {
  return {
    widgets: widgets.map((w) =>
      widgetIds.includes(w.id)
        ? { ...w, layout: { ...w.layout, y: w.layout.y + amount } }
        : w,
    ),
    textBlocks: textBlocks.map((tb) =>
      textBlockIds.includes(tb.id)
        ? { ...tb, layout: { ...tb.layout, y: tb.layout.y + amount } }
        : tb,
    ),
  };
}

export function getNextWidgetInsertionY(
  widgets: Widget[],
  widgetIds: string[],
  textBlocks: TextBlock[],
  textBlockIds: string[],
  newHeight: number,
): number {
  const topY = Math.min(
    ...widgets
      .filter((w) => widgetIds.includes(w.id))
      .map((w) => w.layout.y),
    ...textBlocks
      .filter((tb) => textBlockIds.includes(tb.id))
      .map((tb) => tb.layout.y),
  );

  return Number.isFinite(topY) ? topY - newHeight : 0;
}

export const useWidgetStore = create<WidgetStore>()(
  persist(
    (set, get) => ({
      dashboards: [],
      activeDashboardId: null,
      savedShares: [],
      widgets: [],
      textBlocks: [],
      activeWidgetId: null,
      streamingWidgetIds: [],
      currentActions: {},
      reasoningStreamingIds: [],
      viewports: {},

      saveShare: (shareId, title) => {
        set((state) => ({
          savedShares: [
            ...state.savedShares.filter((s) => s.shareId !== shareId),
            { shareId, title, savedAt: Date.now() },
          ],
        }));
      },

      removeShare: (shareId) => {
        set((state) => ({
          savedShares: state.savedShares.filter((s) => s.shareId !== shareId),
        }));
      },

      addDashboard: (title = "Dashboard") => {
        const id = generateId("dash");
        set((state) => ({
          dashboards: [...state.dashboards, { id, title, widgetIds: [], textBlockIds: [], createdAt: Date.now() }],
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
        const textBlockIds = dashboard?.textBlockIds ?? [];
        set((state) => {
          const nextActions = { ...state.currentActions };
          for (const wid of widgetIds) delete nextActions[wid];
          return {
            dashboards: state.dashboards.filter((d) => d.id !== id),
            widgets: state.widgets.filter((w) => !widgetIds.includes(w.id)),
            textBlocks: state.textBlocks.filter((tb) => !textBlockIds.includes(tb.id)),
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
        const { widgets, dashboards, activeDashboardId, textBlocks } = get();
        let dashId = activeDashboardId;

        if (!dashId || !dashboards.find((d) => d.id === dashId)) {
          dashId = generateId("dash");
          set((state) => ({
            dashboards: [...state.dashboards, { id: dashId!, title: "Dashboard", widgetIds: [], textBlockIds: [], createdAt: Date.now() }],
            activeDashboardId: dashId,
          }));
        }

        const dashboard = get().dashboards.find((d) => d.id === dashId);
        const newHeight = 3;
        const id = generateId("widget");
        const insertionY = getNextWidgetInsertionY(
          widgets,
          dashboard?.widgetIds ?? [],
          textBlocks,
          dashboard?.textBlockIds ?? [],
          newHeight,
        );

        const widget: Widget = {
          id,
          title,
          description,
          messages: [],
          code: null,
          files: {},
          iframeVersion: 0,
          layout: {
            x: 0,
            y: insertionY,
            w: 4,
            h: newHeight,
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

      updateMessageContent: (widgetId, messageId, content) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === widgetId
              ? { ...w, messages: w.messages.map((m) => m.id === messageId ? { ...m, content } : m) }
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

      updateWidgetLayout: (id, layout) => {
        set({
          widgets: get().widgets.map((w) =>
            w.id === id ? { ...w, layout: { ...w.layout, ...layout } } : w
          ),
        });
      },

      setViewport: (dashboardId, viewport) => {
        set((state) => ({
          viewports: { ...state.viewports, [dashboardId]: viewport },
        }));
      },

      applyTemplate: (template) => {
        const { dashboards, activeDashboardId } = get();
        let dashId = activeDashboardId;

        if (!dashId || !dashboards.find((d) => d.id === dashId)) {
          dashId = generateId("dash");
          set((state) => ({
            dashboards: [...state.dashboards, { id: dashId!, title: "Dashboard", widgetIds: [], textBlockIds: [], createdAt: Date.now() }],
            activeDashboardId: dashId,
          }));
        }

        const newWidgets: Widget[] = template.widgets.map((tw) => {
          const id = generateId("widget");
          const parsed = tw.layoutJson ? JSON.parse(tw.layoutJson) : {};
          const layout: CanvasLayout = {
            x: parsed.x ?? 0,
            y: parsed.y ?? 0,
            w: parsed.w ?? 4,
            h: parsed.h ?? 3,
          };
          return {
            id,
            title: tw.title,
            description: tw.description,
            messages: [],
            code: tw.code,
            files: tw.files,
            iframeVersion: 0,
            layout,
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

      addTextBlock: (position) => {
        const { dashboards, activeDashboardId, widgets, textBlocks } = get();
        let dashId = activeDashboardId;

        if (!dashId || !dashboards.find((d) => d.id === dashId)) {
          dashId = generateId("dash");
          set((state) => ({
            dashboards: [...state.dashboards, { id: dashId!, title: "Dashboard", widgetIds: [], textBlockIds: [], createdAt: Date.now() }],
            activeDashboardId: dashId,
          }));
        }

        const dashboard = get().dashboards.find((d) => d.id === dashId);
        const newHeight = 1;
        const id = generateId("text");

        const block: TextBlock = {
          id,
          text: "",
          fontSize: 24,
          layout: { x: position?.x ?? 0, y: position?.y ?? 0, w: 3, h: newHeight },
        };

        if (!position) {
          const shifted = shiftItemsDown(
            widgets,
            dashboard?.widgetIds ?? [],
            textBlocks,
            dashboard?.textBlockIds ?? [],
            newHeight,
          );
          set((state) => ({
            widgets: shifted.widgets,
            textBlocks: [...shifted.textBlocks, block],
            dashboards: state.dashboards.map((d) =>
              d.id === dashId ? { ...d, textBlockIds: [...(d.textBlockIds ?? []), id] } : d
            ),
          }));
        } else {
          set((state) => ({
            textBlocks: [...state.textBlocks, block],
            dashboards: state.dashboards.map((d) =>
              d.id === dashId ? { ...d, textBlockIds: [...(d.textBlockIds ?? []), id] } : d
            ),
          }));
        }
        return id;
      },

      updateTextBlock: (id, updates) => {
        set((state) => ({
          textBlocks: state.textBlocks.map((tb) =>
            tb.id === id ? { ...tb, ...updates } : tb
          ),
        }));
      },

      updateTextBlockLayout: (id, layout) => {
        set((state) => ({
          textBlocks: state.textBlocks.map((tb) =>
            tb.id === id ? { ...tb, layout: { ...tb.layout, ...layout } } : tb
          ),
        }));
      },

      removeTextBlock: (id) => {
        set((state) => ({
          textBlocks: state.textBlocks.filter((tb) => tb.id !== id),
          dashboards: state.dashboards.map((d) => ({
            ...d,
            textBlockIds: (d.textBlockIds ?? []).filter((tbId) => tbId !== id),
          })),
        }));
      },
    }),
    {
      name: "infinite-monitor-widgets",
      merge: (persisted, current) => {
        const stored = persisted as Partial<WidgetStore> | undefined;
        if (!stored) return current;

        const widgets = (stored.widgets ?? []).map((w) => {
          const oldLayout = w.layout as unknown as Record<string, unknown>;
          const layout: CanvasLayout = {
            x: (oldLayout.x as number) ?? 0,
            y: (oldLayout.y as number) ?? 0,
            w: (oldLayout.w as number) ?? 4,
            h: (oldLayout.h as number) ?? 3,
          };

          return {
            ...w,
            code: w.code ?? null,
            files: w.files ?? {},
            iframeVersion: w.iframeVersion ?? 0,
            layout,
            messages: (w.messages ?? []).map((m) => ({
              ...m,
              reasoning: m.reasoning ?? undefined,
            })),
          };
        });

        const textBlocks = (stored.textBlocks ?? []).map((tb) => ({
          ...tb,
          fontSize: tb.fontSize ?? 24,
          layout: {
            x: tb.layout?.x ?? 0,
            y: tb.layout?.y ?? 0,
            w: tb.layout?.w ?? 3,
            h: tb.layout?.h ?? 1,
          },
        }));

        let dashboards = (stored.dashboards ?? []).map((d) => ({
          ...d,
          textBlockIds: (d as Dashboard).textBlockIds ?? [],
        }));
        if (dashboards.length === 0 && widgets.length > 0) {
          dashboards = [{
            id: generateId("dash"),
            title: "Dashboard",
            widgetIds: widgets.map((w) => w.id),
            textBlockIds: [],
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
          savedShares: stored.savedShares ?? [],
          viewports: migrateViewports(stored.viewports),
          widgets,
          textBlocks,
        };
      },
    }
  )
);

type DurableStoreState = Pick<WidgetStore, "dashboards" | "widgets" | "textBlocks" | "viewports">;

export function buildSyncPayloadFromStoreState(state: DurableStoreState): SyncPayload {
  return {
    dashboards: state.dashboards.map((d) => ({
      id: d.id,
      title: d.title,
      widgetIds: d.widgetIds,
      textBlockIds: d.textBlockIds ?? [],
      createdAt: d.createdAt,
      viewport: state.viewports[d.id] ?? DEFAULT_CANVAS_VIEWPORT,
    })),
    widgets: state.widgets.map((w) => ({
      id: w.id,
      title: w.title,
      description: w.description,
      code: w.code,
      files: w.files,
      layout: w.layout,
      messages: w.messages,
    })),
    textBlocks: state.textBlocks.map((tb) => ({
      id: tb.id,
      text: tb.text,
      fontSize: tb.fontSize,
      layout: tb.layout,
    })),
  };
}

configureSyncPayloadProvider(() => buildSyncPayloadFromStoreState(useWidgetStore.getState()));
