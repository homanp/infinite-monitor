"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  GripVertical,
  X,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useWidgetStore, type Widget } from "@/store/widget-store";

// ─── TV static noise (shown while building) ───────────────────────────────────

function StaticNoise() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    const W = canvas.width;
    const H = canvas.height;

    function draw() {
      const img = ctx!.createImageData(W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = (Math.random() * 200) | 0;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = Math.random() > 0.15 ? 180 : 0;
      }
      ctx!.putImageData(img, 0, 0);
      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <canvas
        ref={canvasRef}
        width={80}
        height={60}
        className="w-full h-full opacity-60"
        style={{ imageRendering: "pixelated" }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 4px)",
        }}
      />
    </div>
  );
}

// ─── Widget card ──────────────────────────────────────────────────────────────

interface WidgetCardProps {
  widget: Widget;
  onRemove: (id: string) => void;
}

export function WidgetCard({ widget, onRemove }: WidgetCardProps) {
  const [expanded, setExpanded] = useState(false);
  const activeWidgetId = useWidgetStore((s) => s.activeWidgetId);
  const setActiveWidget = useWidgetStore((s) => s.setActiveWidget);
  const clearWidgetCode = useWidgetStore((s) => s.clearWidgetCode);
  const isBuilding = useWidgetStore((s) =>
    s.streamingWidgetIds.includes(widget.id)
  );
  const isActive = activeWidgetId === widget.id;

  const collapse = useCallback(() => setExpanded(false), []);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") collapse();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded, collapse]);

  const handleRebuild = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      clearWidgetCode(widget.id);
      setActiveWidget(widget.id);
    },
    [widget.id, clearWidgetCode, setActiveWidget]
  );

  const iframeSrc = `/api/widget/${widget.id}/`;

  const header = (isExpanded: boolean) => (
    <div className={cn(
      "flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-700",
      !isExpanded && "drag-handle cursor-grab active:cursor-grabbing"
    )}>
      <div className="flex items-center gap-2 min-w-0">
        {!isExpanded && (
          <div className="p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors">
            <GripVertical className="h-4 w-4" />
          </div>
        )}
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-300 truncate">
          {widget.title}
        </span>
        {isBuilding && (
          <RefreshCw className="size-3 animate-spin text-zinc-400 shrink-0" />
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!isExpanded);
          }}
        >
          {isExpanded ? (
            <Minimize2 className="h-3 w-3" />
          ) : (
            <Maximize2 className="h-3 w-3" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-500 hover:text-red-400 hover:bg-zinc-700"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(widget.id);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );

  const widgetContent = () => {
    if (widget.code && isBuilding) {
      return (
        <CardContent className="relative flex-1 min-h-0 p-0! overflow-hidden">
          <StaticNoise />
        </CardContent>
      );
    }

    if (widget.code) {
      return (
        <CardContent className="relative flex-1 min-h-0 p-0! overflow-hidden">
          <iframe
            key={widget.iframeVersion}
            src={iframeSrc}
            className="absolute inset-0 w-full h-full border-0"
            title={widget.title}
          />
        </CardContent>
      );
    }

    if (isBuilding) {
      return (
        <CardContent className="relative flex-1 min-h-0 p-0! overflow-hidden">
          <StaticNoise />
        </CardContent>
      );
    }

    return (
      <CardContent className="flex-1 p-3 overflow-auto">
        <p className="text-xs text-zinc-500">
          {widget.description || "Open the chat to start building this widget."}
        </p>
      </CardContent>
    );
  };

  return (
    <>
      <Card
        className={cn(
          "h-full flex flex-col rounded-none bg-zinc-800 border-zinc-700 ring-zinc-700 py-0 gap-0 cursor-pointer transition-colors hover:bg-zinc-700/80",
          isActive && "ring-1 ring-teal-500/60 border-teal-500/40"
        )}
        onClick={() => setActiveWidget(widget.id)}
      >
        {header(false)}
        {widgetContent()}
      </Card>

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-150">
            <Card className="m-4 flex-1 flex flex-col rounded-none bg-zinc-800 border-zinc-700 ring-zinc-700 py-0 gap-0 overflow-hidden">
              {header(true)}
              {widget.code ? (
                <CardContent className="relative flex-1 min-h-0 p-0! overflow-hidden">
                  <iframe
                    key={widget.iframeVersion}
                    src={iframeSrc}
                    className="absolute inset-0 w-full h-full border-0"
                    title={widget.title}
                  />
                </CardContent>
              ) : (
                <CardContent className="flex-1 p-6 overflow-auto">
                  <p className="text-sm text-zinc-500">{widget.description}</p>
                </CardContent>
              )}
            </Card>
          </div>,
          document.body
        )}
    </>
  );
}
