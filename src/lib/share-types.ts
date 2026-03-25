import { z } from "zod";
import { isCanvasViewportSnapshot, type CanvasViewportSnapshot } from "@/lib/canvas-viewport";

export const MAX_SHARED_TRACE_EVENTS = 500;

// ── Type definitions ──

export interface PublishedCanvasLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PublishedTextBlockSnapshotV1 {
  id: string;
  text: string;
  fontSize: number;
  layout: PublishedCanvasLayout;
}

export interface PublishedWidgetSnapshotV1 {
  sourceWidgetId: string;
  publishedWidgetId: string;
  revision: string;
  title: string;
  description: string;
  layout: PublishedCanvasLayout;
  files: Record<string, string>;
}

export interface DashboardSharedStateV1 {
  version: "v1";
  shareId: string;
  dashboardId: string;
  title: string;
  updatedAt: string;
  viewport?: CanvasViewportSnapshot | null;
  textBlocks: PublishedTextBlockSnapshotV1[];
  widgets: PublishedWidgetSnapshotV1[];
}

export type PublishedTraceEventKind =
  | "run-start"
  | "tool-call"
  | "file-written"
  | "run-finished"
  | "run-abort"
  | "run-error";

export interface PublishedTraceEventV1 {
  id: string;
  runId: string;
  shareId: string;
  publishedWidgetId: string;
  widgetTitle: string;
  kind: PublishedTraceEventKind;
  at: string;
  detail: string;
  toolName?: string;
  path?: string;
}

export interface SharedTraceStateV1 {
  version: "v1";
  shareId: string;
  updatedAt: string;
  nextOffset?: string | null;
  events: PublishedTraceEventV1[];
}

export interface SharedDashboardStateEventV1 {
  version: "v1";
  kind: "dashboard.state";
  shareId: string;
  dashboardId: string;
  at: string;
  stateHash: string;
  state: DashboardSharedStateV1;
}

export interface SharedTraceEventEnvelopeV1 {
  version: "v1";
  kind: "trace.event";
  shareId: string;
  dashboardId: string;
  at: string;
  event: PublishedTraceEventV1;
}

export interface SharedChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
}

export interface SharedChatMessagesEventV1 {
  version: "v1";
  kind: "chat.messages";
  shareId: string;
  dashboardId: string;
  publishedWidgetId: string;
  widgetTitle: string;
  at: string;
  messages: SharedChatMessage[];
}

export type SharedSessionEventV1 =
  | SharedDashboardStateEventV1
  | SharedTraceEventEnvelopeV1
  | SharedChatMessagesEventV1;

export interface SharedWidgetChat {
  publishedWidgetId: string;
  widgetTitle: string;
  messages: SharedChatMessage[];
}

export interface SharedSessionSnapshotV1 {
  version: "v1";
  shareId: string;
  dashboard: DashboardSharedStateV1 | null;
  trace: SharedTraceStateV1;
  chats: SharedWidgetChat[];
  updatedAt: string;
}

// ── Zod schemas ──

const CanvasLayoutSchema = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });

const TraceEventKindSchema = z.enum(["run-start", "tool-call", "file-written", "run-finished", "run-abort", "run-error"]);

const PublishedTraceEventV1Schema = z.object({
  id: z.string(), runId: z.string(), shareId: z.string(),
  publishedWidgetId: z.string(), widgetTitle: z.string(),
  kind: TraceEventKindSchema, at: z.string(), detail: z.string(),
  toolName: z.string().optional(), path: z.string().optional(),
});

const CanvasViewportSchema = z.object({ panX: z.number(), panY: z.number(), zoom: z.number() });

const DashboardSharedStateV1Schema = z.object({
  version: z.literal("v1"), shareId: z.string(), dashboardId: z.string(),
  title: z.string(), updatedAt: z.string(),
  viewport: CanvasViewportSchema.nullable().optional(),
  textBlocks: z.array(z.object({ id: z.string(), text: z.string(), fontSize: z.number(), layout: CanvasLayoutSchema })),
  widgets: z.array(z.object({
    sourceWidgetId: z.string(), publishedWidgetId: z.string(), revision: z.string(),
    title: z.string(), description: z.string(), layout: CanvasLayoutSchema,
    files: z.record(z.string(), z.string()),
  })),
});

const SharedDashboardStateEventV1Schema = z.object({
  version: z.literal("v1"), kind: z.literal("dashboard.state"),
  shareId: z.string(), dashboardId: z.string(), at: z.string(),
  stateHash: z.string(), state: DashboardSharedStateV1Schema,
});

const SharedTraceEventEnvelopeV1Schema = z.object({
  version: z.literal("v1"), kind: z.literal("trace.event"),
  shareId: z.string(), dashboardId: z.string(), at: z.string(),
  event: PublishedTraceEventV1Schema,
});

const SharedChatMessageSchema = z.object({
  id: z.string(), role: z.enum(["user", "assistant"]), content: z.string(),
  reasoning: z.string().optional(),
});

const SharedChatMessagesEventV1Schema = z.object({
  version: z.literal("v1"), kind: z.literal("chat.messages"),
  shareId: z.string(), dashboardId: z.string(),
  publishedWidgetId: z.string(), widgetTitle: z.string(), at: z.string(),
  messages: z.array(SharedChatMessageSchema),
});

export const SharedSessionEventV1Schema = z.union([
  SharedDashboardStateEventV1Schema,
  SharedTraceEventEnvelopeV1Schema,
  SharedChatMessagesEventV1Schema,
]);

const SharedTraceStateV1Schema = z.object({
  version: z.literal("v1"), shareId: z.string(), updatedAt: z.string(),
  nextOffset: z.string().nullable().optional(), events: z.array(PublishedTraceEventV1Schema),
});

const SharedWidgetChatSchema = z.object({
  publishedWidgetId: z.string(), widgetTitle: z.string(),
  messages: z.array(SharedChatMessageSchema),
});

export const SharedSessionSnapshotV1Schema = z.object({
  version: z.literal("v1"), shareId: z.string(), updatedAt: z.string(),
  dashboard: DashboardSharedStateV1Schema.nullable(),
  trace: SharedTraceStateV1Schema,
  chats: z.array(SharedWidgetChatSchema).optional(),
});

// ── Empty state builders ──

export function buildEmptySharedTraceState(shareId: string, updatedAt = new Date().toISOString()): SharedTraceStateV1 {
  return { version: "v1", shareId, updatedAt, nextOffset: null, events: [] };
}

export function buildEmptySharedSessionSnapshot(shareId: string, updatedAt = new Date().toISOString()): SharedSessionSnapshotV1 {
  return { version: "v1", shareId, dashboard: null, trace: buildEmptySharedTraceState(shareId, updatedAt), chats: [], updatedAt };
}

// ── Reducer ──

function reduceSlices(snapshot: SharedSessionSnapshotV1, event: SharedSessionEventV1): SharedSessionSnapshotV1 {
  switch (event.kind) {
    case "dashboard.state":
      return { ...snapshot, dashboard: event.state, updatedAt: event.at };
    case "trace.event": {
      const events = [...snapshot.trace.events, event.event].slice(-MAX_SHARED_TRACE_EVENTS);
      return { ...snapshot, trace: { ...snapshot.trace, updatedAt: event.at, events }, updatedAt: event.at };
    }
    case "chat.messages": {
      const chats = (snapshot.chats ?? []).filter((c) => c.publishedWidgetId !== event.publishedWidgetId);
      chats.push({ publishedWidgetId: event.publishedWidgetId, widgetTitle: event.widgetTitle, messages: event.messages });
      return { ...snapshot, chats, updatedAt: event.at };
    }
  }
}

export function applySharedSessionEvent(snapshot: SharedSessionSnapshotV1, event: SharedSessionEventV1): SharedSessionSnapshotV1 {
  return reduceSlices(snapshot, event);
}
