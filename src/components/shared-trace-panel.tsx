"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
  Waypoints,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type {
  PublishedTraceEventKind,
  SharedSessionReplayFrameV1,
  SharedSessionStateV1,
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
  liveSession,
  replaySession,
  replayFrames,
  replayFrameIndex,
  liveError,
  onReplayFrameIndexChange,
}: {
  liveSession: SharedSessionStateV1;
  replaySession: SharedSessionStateV1;
  replayFrames: SharedSessionReplayFrameV1[];
  replayFrameIndex: number;
  liveError?: string | null;
  onReplayFrameIndexChange: (nextReplayFrameIndex: number) => void;
}) {
  const replayStepCount = replayFrames.length > 0 ? replayFrames.length - 1 : 0;
  const [playing, setPlaying] = useState(false);
  const [collapsed, setCollapsed] = useState(replayStepCount === 0);
  const isPlaying = playing && replayStepCount > 0 && replayFrameIndex < replayStepCount;
  const visibleEvents = useMemo(
    () => replayFrames
      .slice(1, replayFrameIndex + 1)
      .flatMap((frame) => (frame.traceEvent ? [frame.traceEvent] : [])),
    [replayFrameIndex, replayFrames],
  );
  const currentEvent = replayFrames[replayFrameIndex]?.traceEvent ?? null;
  const liveAction = replaySession.activeWidgetId
    ? replaySession.currentActions[replaySession.activeWidgetId] ?? null
    : null;
  const latestLiveAction = liveSession.activeWidgetId
    ? liveSession.currentActions[liveSession.activeWidgetId] ?? null
    : null;
  const collapsedLabel = liveSession.streamingWidgetIds.length > 0
    ? "Live"
    : replayStepCount === 0
      ? "No Trace"
      : `${replayStepCount} Events`;

  useEffect(() => {
    if (!isPlaying) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const nextReplayFrameIndex = replayFrameIndex + 1;
      if (nextReplayFrameIndex >= replayStepCount) {
        onReplayFrameIndexChange(replayStepCount);
        setPlaying(false);
        return;
      }

      onReplayFrameIndexChange(nextReplayFrameIndex);
    }, 650);

    return () => window.clearTimeout(timeout);
  }, [isPlaying, onReplayFrameIndexChange, replayFrameIndex, replayStepCount]);

  return (
    <aside className={`shrink-0 border-zinc-800 bg-zinc-950/60 transition-all ${collapsed ? "h-[4.5rem] w-full border-t lg:h-auto lg:w-[72px] lg:border-t-0 lg:border-l" : "flex h-[18rem] w-full flex-col border-t lg:h-auto lg:w-[340px] lg:border-t-0 lg:border-l"}`}>
      <div className="border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-zinc-500">
              Session Replay
            </div>
            {!collapsed && (
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="text-sm uppercase tracking-[0.18em] text-zinc-100">
                  Agent Timeline
                </div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  {replayStepCount} events
                </div>
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
      ) : replayStepCount === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Waypoints className="h-5 w-5 text-zinc-500" />
          <div className="text-sm text-zinc-200">
            {latestLiveAction ? "Shared session is live" : "No replay events yet"}
          </div>
          <p className="text-xs leading-relaxed text-zinc-500">
            {latestLiveAction
              ? `Current activity: ${latestLiveAction}`
              : "Replay appears here after this shared dashboard records new agent activity."}
          </p>
          {liveError && (
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-300">
              {liveError}
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (replayStepCount === 0) {
                    return;
                  }

                  if (replayFrameIndex >= replayStepCount) {
                    onReplayFrameIndexChange(0);
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
                  onReplayFrameIndexChange(0);
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
                max={replayStepCount}
                value={replayFrameIndex}
                onChange={(event) => {
                  setPlaying(false);
                  onReplayFrameIndexChange(Number(event.currentTarget.value));
                }}
                className="w-full accent-teal-400"
              />
              <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                <span>
                  Step {replayFrameIndex}/{replayStepCount}
                </span>
                <span>{isPlaying ? "Playing" : "Paused"}</span>
              </div>
              {currentEvent && (
                <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  {currentEvent.widgetTitle} · {getTraceKindLabel(currentEvent.kind)}
                </div>
              )}
              {!currentEvent && liveAction && (
                <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-zinc-400">
                  {liveAction}
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
    </aside>
  );
}
