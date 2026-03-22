"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Pause,
  Play,
  RotateCcw,
  Waypoints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  isPublishedTraceEventV1,
  type PublishedTraceEventV1,
  type PublishedDashboardTraceV1,
  type PublishedTraceEventKind,
} from "@/lib/share-types";

function formatTraceTimestamp(value: string) {
  return value.replace(".000Z", "Z").replace("T", " ");
}

function getTraceKindLabel(kind: PublishedTraceEventKind) {
  switch (kind) {
    case "run-start":
      return "Start";
    case "tool-call":
      return "Tool";
    case "file-written":
      return "Write";
    case "run-finished":
      return "Done";
    case "run-abort":
      return "Abort";
    case "run-error":
      return "Error";
  }
}

function getTraceKindClassName(kind: PublishedTraceEventKind) {
  switch (kind) {
    case "run-start":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";
    case "tool-call":
      return "border-sky-500/30 bg-sky-500/10 text-sky-100";
    case "file-written":
      return "border-teal-500/30 bg-teal-500/10 text-teal-100";
    case "run-finished":
      return "border-zinc-600 bg-zinc-800 text-zinc-100";
    case "run-abort":
      return "border-amber-500/30 bg-amber-500/10 text-amber-100";
    case "run-error":
      return "border-red-500/30 bg-red-500/10 text-red-100";
  }
}

export function SharedTracePanel({
  shareId,
  onActiveWidgetChange,
}: {
  shareId: string;
  onActiveWidgetChange: (publishedWidgetId: string | null) => void;
}) {
  const [trace, setTrace] = useState<PublishedDashboardTraceV1 | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [replayIndex, setReplayIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let eventSource: EventSource | null = null;
    let reconnectTimer: number | null = null;
    let nextLiveOffset = "now";

    const appendLiveEvent = (liveEvent: PublishedTraceEventV1) => {
      setTrace((previousTrace) => {
        const baseTrace = previousTrace ?? {
          version: "v1" as const,
          shareId,
          updatedAt: liveEvent.at,
          events: [],
        };

        if (baseTrace.events.some((event) => event.id === liveEvent.id)) {
          return baseTrace;
        }

        const nextEvents = [...baseTrace.events, liveEvent];
        const nextTrace = {
          ...baseTrace,
          updatedAt: liveEvent.at,
          events: nextEvents,
        };

        setReplayIndex((previousIndex) => {
          if (previousIndex === null || previousIndex >= baseTrace.events.length) {
            return nextEvents.length;
          }
          return previousIndex;
        });

        return nextTrace;
      });
    };

    const handleLivePayload = (payload: unknown) => {
      const candidates = Array.isArray(payload) ? payload : [payload];
      let didAppendEvent = false;

      for (const candidate of candidates) {
        if (!isPublishedTraceEventV1(candidate)) {
          continue;
        }

        didAppendEvent = true;
        appendLiveEvent(candidate);
      }

      if (didAppendEvent && !cancelled) {
        setLiveError(null);
      }
    };

    const connectLive = (offset: string) => {
      if (cancelled) {
        return;
      }

      nextLiveOffset = offset;
      eventSource?.close();
      eventSource = new EventSource(
        `/api/share/${shareId}/trace/live?offset=${encodeURIComponent(offset)}`,
      );

      eventSource.addEventListener("data", (event) => {
        try {
          handleLivePayload(JSON.parse((event as MessageEvent<string>).data));
        } catch {
          // Ignore malformed SSE data frames.
        }
      });

      eventSource.addEventListener("control", (event) => {
        try {
          const parsed = JSON.parse((event as MessageEvent<string>).data) as unknown;
          if (
            parsed
            && typeof parsed === "object"
            && typeof (parsed as { streamNextOffset?: unknown }).streamNextOffset === "string"
          ) {
            nextLiveOffset = (parsed as { streamNextOffset: string }).streamNextOffset;
            setLiveError(null);
          }
        } catch {
          // Ignore malformed control frames.
        }
      });

      eventSource.onerror = () => {
        if (cancelled) {
          return;
        }

        eventSource?.close();
        eventSource = null;
        setLiveError("Live trace connection interrupted");

        if (reconnectTimer !== null) {
          return;
        }

        reconnectTimer = window.setTimeout(() => {
          reconnectTimer = null;
          connectLive(nextLiveOffset);
        }, 1500);
      };
    };

    const loadTrace = async () => {
      setLoading(true);
      setBootstrapError(null);
      setLiveError(null);

      try {
        const response = await fetch(`/api/share/${shareId}/trace/bootstrap`);
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(data?.error ?? `Trace load failed with status ${response.status}`);
        }

        if (!cancelled) {
          const bootstrapTrace = (data as { trace: PublishedDashboardTraceV1 }).trace;
          setTrace(bootstrapTrace);
          setReplayIndex(bootstrapTrace.events.length);
          setCollapsed(bootstrapTrace.events.length === 0);

          connectLive((data as { nextOffset?: string | null }).nextOffset ?? "now");
        }
      } catch (err) {
        if (!cancelled) {
          setBootstrapError(err instanceof Error ? err.message : String(err));
          setTrace(null);
          setReplayIndex(null);
          setCollapsed(false);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTrace();

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      eventSource?.close();
    };
  }, [shareId]);

  const events = useMemo(() => trace?.events ?? [], [trace]);
  const currentIndex = replayIndex ?? events.length;
  const visibleEvents = useMemo(
    () => events.slice(0, currentIndex),
    [currentIndex, events],
  );
  const currentEvent = currentIndex > 0 ? events[currentIndex - 1] : null;
  const collapsedLabel = loading
    ? "Loading"
    : bootstrapError
      ? "Unavailable"
      : events.length === 0
        ? "No Trace"
        : `${events.length} Events`;

  useEffect(() => {
    onActiveWidgetChange(collapsed ? null : currentEvent?.publishedWidgetId ?? null);
  }, [collapsed, currentEvent, onActiveWidgetChange]);

  useEffect(() => {
    if (!playing) {
      return;
    }

    if (events.length === 0 || currentIndex >= events.length) {
      setPlaying(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      setReplayIndex(currentIndex + 1);
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [currentIndex, events.length, playing]);

  return (
    <aside className={`shrink-0 border-zinc-800 bg-zinc-950/60 transition-all ${collapsed ? "h-[4.5rem] w-full border-t lg:h-auto lg:w-[72px] lg:border-t-0 lg:border-l" : "flex h-[18rem] w-full flex-col border-t lg:h-auto lg:w-[340px] lg:border-t-0 lg:border-l"}`}>
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Trace Replay
            </div>
            {!collapsed && (
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="text-sm uppercase tracking-[0.18em] text-zinc-100">
                  Agent Timeline
                </div>
                {trace && (
                  <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    {trace.events.length} events
                  </div>
                )}
              </div>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setCollapsed((value) => !value)}
            className="justify-center border border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800"
          >
            {collapsed ? <ChevronLeft className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {collapsed ? (
        <div className="flex h-full items-center justify-center px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-zinc-500 lg:[writing-mode:vertical-rl] lg:[text-orientation:mixed]">
          {collapsedLabel}
        </div>
      ) : (
        <>
          {loading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading trace…
            </div>
          ) : bootstrapError ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              <div className="text-sm text-zinc-200">Trace unavailable</div>
              <p className="text-xs leading-relaxed text-zinc-500">{bootstrapError}</p>
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <Waypoints className="h-5 w-5 text-zinc-500" />
              <div className="text-sm text-zinc-200">No replay events yet</div>
              <p className="text-xs leading-relaxed text-zinc-500">
                Trace replay appears here after a published dashboard runs new widget generation work.
              </p>
            </div>
          ) : (
            <>
              <div className="border-b border-zinc-800 px-4 py-3">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (currentIndex >= events.length) {
                        setReplayIndex(0);
                      }
                      setPlaying(true);
                    }}
                    className="flex-1 justify-center border border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Play
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setPlaying(false)}
                    className="flex-1 justify-center border border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setPlaying(false);
                      setReplayIndex(0);
                    }}
                    className="justify-center border border-zinc-700 bg-zinc-900/50 text-zinc-200 hover:bg-zinc-800"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="mt-3">
                  <input
                    type="range"
                    min={0}
                    max={events.length}
                    value={currentIndex}
                    onChange={(event) => {
                      setPlaying(false);
                      setReplayIndex(Number(event.currentTarget.value));
                    }}
                    className="w-full accent-teal-400"
                  />
                  <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                    <span>
                      Step {currentIndex}/{events.length}
                    </span>
                    <span>{playing ? "Playing" : "Paused"}</span>
                  </div>
                  {currentEvent && (
                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                      {currentEvent.widgetTitle} · {getTraceKindLabel(currentEvent.kind)}
                    </div>
                  )}
                  {liveError && (
                    <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-amber-300">
                      {liveError}
                    </div>
                  )}
                </div>
              </div>

              <ScrollArea className="min-h-0 flex-1">
                <div className="space-y-2 p-4">
                  {visibleEvents.map((event, index) => {
                    const isCurrent = index === visibleEvents.length - 1;

                    return (
                      <div
                        key={event.id}
                        className={`border px-3 py-2 transition-colors ${
                          isCurrent
                            ? "border-teal-500/40 bg-teal-500/10"
                            : "border-zinc-800 bg-zinc-900/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                              {event.widgetTitle}
                            </div>
                            <div className="mt-1 text-xs leading-relaxed text-zinc-200">
                              {event.detail}
                            </div>
                          </div>
                          <div className={`shrink-0 border px-1.5 py-1 text-[10px] uppercase tracking-[0.18em] ${getTraceKindClassName(event.kind)}`}>
                            {getTraceKindLabel(event.kind)}
                          </div>
                        </div>

                        <div className="mt-2 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                          <span>#{index + 1}</span>
                          <span>{formatTraceTimestamp(event.at)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </>
      )}
    </aside>
  );
}
