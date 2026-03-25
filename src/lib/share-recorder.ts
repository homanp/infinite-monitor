import { randomUUID } from "node:crypto";
import { getWidget, getDashboardByWidgetId } from "@/db/widgets";
import { deriveShareId, getSessionStreamId, getPublishedWidgetId, SHARE_BUCKET } from "@/lib/share";
import { getDurableStreamClient } from "@/lib/durable-stream";
import { loadDashboardPublishSource, buildDashboardSharedState, buildDashboardStateContentHash, materializePublishedWidgets } from "@/lib/share-projection";
import type { PublishedTraceEventKind, SharedChatMessage } from "@/lib/share-types";

export interface SharedSessionRecorder {
  shareId: string;
  dashboardId: string;
  publishedWidgetId: string;
  widgetTitle: string;
  startRun: (at?: string) => void;
  record: (kind: PublishedTraceEventKind, detail: string, extra?: { toolName?: string; path?: string; at?: string }) => void;
  finish: (at?: string) => void;
  flushMessages: (messages: SharedChatMessage[]) => void;
  flush: () => Promise<void>;
}

async function isShared(shareId: string) {
  const ds = getDurableStreamClient();
  const head = await ds.head(SHARE_BUCKET, getSessionStreamId(shareId));
  return head.exists;
}

export async function maybeCreateTraceRecorder(widgetId: string): Promise<SharedSessionRecorder | null> {
  const widget = getWidget(widgetId);
  if (!widget) return null;
  const dashboard = getDashboardByWidgetId(widgetId);
  if (!dashboard) return null;

  const shareId = deriveShareId(dashboard.id);
  if (!(await isShared(shareId))) return null;

  const publishedWidgetId = getPublishedWidgetId(shareId, widgetId);
  const runId = randomUUID();
  const streamId = getSessionStreamId(shareId);
  let pendingFlush: Promise<void> = Promise.resolve();

  const enqueue = (task: () => Promise<void>) => {
    pendingFlush = pendingFlush.then(task).catch((err) => console.error("[share-recorder] flush error:", err));
  };

  const appendTrace = (kind: PublishedTraceEventKind, detail: string, extra: { toolName?: string; path?: string; at?: string } = {}) => {
    const event = {
      version: "v1" as const, kind: "trace.event" as const, shareId, dashboardId: dashboard.id, at: extra.at ?? new Date().toISOString(),
      event: { id: randomUUID(), runId, shareId, publishedWidgetId, widgetTitle: widget.title, kind, at: extra.at ?? new Date().toISOString(), detail, ...(extra.toolName ? { toolName: extra.toolName } : {}), ...(extra.path ? { path: extra.path } : {}) },
    };
    enqueue(async () => { await getDurableStreamClient().appendJson(SHARE_BUCKET, streamId, event); });
  };

  return {
    shareId, dashboardId: dashboard.id, publishedWidgetId, widgetTitle: widget.title,
    startRun(at = new Date().toISOString()) {
      appendTrace("run-start", `Started run for ${widget.title}`, { at });
    },
    record(kind, detail, extra) { appendTrace(kind, detail, extra ?? {}); },
    finish(at = new Date().toISOString()) { void at; },
    flushMessages(messages: SharedChatMessage[]) {
      const event = {
        version: "v1" as const, kind: "chat.messages" as const,
        shareId, dashboardId: dashboard.id, publishedWidgetId, widgetTitle: widget.title,
        at: new Date().toISOString(), messages,
      };
      enqueue(async () => { await getDurableStreamClient().appendJson(SHARE_BUCKET, streamId, event); });
    },
    flush() { return pendingFlush; },
  };
}

export async function publishDashboardStateForWidgetIfShared(widgetId: string) {
  const dashboard = getDashboardByWidgetId(widgetId);
  if (!dashboard) return;
  const shareId = deriveShareId(dashboard.id);
  if (!(await isShared(shareId))) return;

  const source = loadDashboardPublishSource(dashboard.id);
  const state = buildDashboardSharedState(source, shareId);
  await materializePublishedWidgets(state, { waitForBuild: false });

  const streamId = getSessionStreamId(shareId);
  const ds = getDurableStreamClient();
  const event = { version: "v1" as const, kind: "dashboard.state" as const, shareId, dashboardId: dashboard.id, at: state.updatedAt, stateHash: buildDashboardStateContentHash(state), state };
  await ds.appendJson(SHARE_BUCKET, streamId, event);
}
