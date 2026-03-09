"use client";

import { GripVertical, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { Widget } from "@/store/widget-store";

interface WidgetCardProps {
  widget: Widget;
  onRemove: (id: string) => void;
}

export function WidgetCard({ widget, onRemove }: WidgetCardProps) {
  return (
    <Card className="h-full flex flex-col rounded-none bg-zinc-900/80 border-zinc-800 ring-zinc-800 py-0">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-zinc-800">
        <div className="flex items-center gap-2 min-w-0">
          <div className="drag-handle cursor-grab active:cursor-grabbing p-0.5 text-zinc-500 hover:text-zinc-300 transition-colors">
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-300 truncate">
            {widget.title}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(widget.id);
          }}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
      <CardContent className="flex-1 p-3 overflow-auto">
        <p className="text-xs text-zinc-500">{widget.description}</p>
      </CardContent>
    </Card>
  );
}
